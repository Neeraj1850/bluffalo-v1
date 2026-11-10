//! NEAR Poker Agent — escrow and on-chain deal commitments.
//!
//! The game engine and the AI run off-chain. This contract holds the money and
//! makes every hand auditable:
//! 1. `commit_hand`: before the deal, the operator records sha256(server seed)
//!    and locks the player's stake.
//! 2. `settle_hand`: after the hand, the operator reveals the server seed. The
//!    contract checks it against the commitment, stores both seeds and pays out.
//!
//! Anyone can read a settled hand, re-deal it from sha256(server_seed:player_seed)
//! and check the result. Payouts are bounded on-chain: a player can never get
//! more than their stake plus the house's matching stake.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum HandStatus {
    Committed,
    Settled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Hand {
    pub player: AccountId,
    /// Hex sha256 of the server seed, recorded before the deal.
    pub commitment: String,
    /// Player's stake locked for this hand (yoctoNEAR).
    pub stake: U128,
    /// House stake locked to match it (yoctoNEAR).
    pub house_stake: U128,
    pub committed_at: u64,
    pub status: HandStatus,
    pub server_seed: Option<String>,
    pub player_seed: Option<String>,
    /// What the player got back from the pot (yoctoNEAR).
    pub payout: Option<U128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Poker {
    /// The backend account that deals and settles hands.
    operator: AccountId,
    balances: LookupMap<AccountId, u128>,
    /// House money available to match player stakes.
    house: u128,
    hands: LookupMap<String, Hand>,
}

fn is_hex(s: &str, len: usize) -> bool {
    s.len() == len
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[near]
impl Poker {
    #[init]
    pub fn new(operator: AccountId) -> Self {
        Self {
            operator,
            balances: LookupMap::new(b"b"),
            house: 0,
            hands: LookupMap::new(b"h"),
        }
    }

    // ----- money ---------------------------------------------------------

    /// Add the attached NEAR to the caller's playing balance.
    #[payable]
    pub fn deposit(&mut self) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach some NEAR to deposit");
        let who = env::predecessor_account_id();
        let balance = self.balance(&who) + amount;
        self.balances.insert(who, balance);
        U128(balance)
    }

    /// Add the attached NEAR to someone else's balance (the operator funds agents this way).
    #[payable]
    pub fn deposit_for(&mut self, account_id: AccountId) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach some NEAR to deposit");
        let balance = self.balance(&account_id) + amount;
        self.balances.insert(account_id, balance);
        U128(balance)
    }

    /// Send NEAR from the caller's (unlocked) balance back to them.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let who = env::predecessor_account_id();
        let balance = self.balance(&who);
        require!(amount.0 > 0 && amount.0 <= balance, "Not enough balance");
        self.balances.insert(who.clone(), balance - amount.0);
        Promise::new(who).transfer(NearToken::from_yoctonear(amount.0))
    }

    /// Operator adds house money.
    #[payable]
    pub fn fund_house(&mut self) -> U128 {
        self.only_operator();
        self.house += env::attached_deposit().as_yoctonear();
        U128(self.house)
    }

    // ----- hands ---------------------------------------------------------

    /// Before the deal: lock the stakes and record the server seed's hash.
    pub fn commit_hand(&mut self, hand_id: String, player: AccountId, commitment: String, stake: U128) {
        self.only_operator();
        require!(is_hex(&hand_id, 8), "hand_id must be 8 hex characters");
        require!(is_hex(&commitment, 64), "commitment must be a hex sha256");
        require!(self.hands.get(&hand_id).is_none(), "Hand already exists");
        require!(stake.0 > 0, "Stake must be positive");

        let balance = self.balance(&player);
        require!(stake.0 <= balance, "Player balance is too low");
        require!(stake.0 <= self.house, "House can't match this stake");
        self.balances.insert(player.clone(), balance - stake.0);
        self.house -= stake.0;

        self.hands.insert(
            hand_id,
            Hand {
                player,
                commitment,
                stake,
                house_stake: stake,
                committed_at: env::block_height(),
                status: HandStatus::Committed,
                server_seed: None,
                player_seed: None,
                payout: None,
            },
        );
    }

    /// After the hand: reveal the seeds and pay out. Fails if the server seed
    /// doesn't match what was committed before the deal.
    pub fn settle_hand(&mut self, hand_id: String, server_seed: String, player_seed: String, payout: U128) {
        self.only_operator();
        let mut hand = self
            .hands
            .get(&hand_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Unknown hand"));
        require!(hand.status == HandStatus::Committed, "Hand already settled");
        require!(
            is_hex(&server_seed, 32) && is_hex(&player_seed, 32),
            "Seeds must be 32 hex characters"
        );
        require!(
            hex(&env::sha256(server_seed.as_bytes())) == hand.commitment,
            "Server seed doesn't match the commitment"
        );
        let pot = hand.stake.0 + hand.house_stake.0;
        require!(payout.0 <= pot, "Payout exceeds the pot");

        let balance = self.balance(&hand.player);
        self.balances.insert(hand.player.clone(), balance + payout.0);
        self.house += pot - payout.0;

        hand.status = HandStatus::Settled;
        hand.server_seed = Some(server_seed);
        hand.player_seed = Some(player_seed);
        hand.payout = Some(payout);
        self.hands.insert(hand_id, hand);
    }

    // ----- views ---------------------------------------------------------

    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balance(&account_id))
    }

    pub fn house_balance(&self) -> U128 {
        U128(self.house)
    }

    pub fn get_hand(&self, hand_id: String) -> Option<Hand> {
        self.hands.get(&hand_id).cloned()
    }

    pub fn operator(&self) -> AccountId {
        self.operator.clone()
    }

    // ----- internal ------------------------------------------------------

    fn balance(&self, who: &AccountId) -> u128 {
        self.balances.get(who).copied().unwrap_or(0)
    }

    fn only_operator(&self) {
        require!(
            env::predecessor_account_id() == self.operator,
            "Only the operator can do this"
        );
    }
}

#[cfg(test)]
mod tests;
