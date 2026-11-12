//! Bluffalo — escrow and on-chain deal commitments.
//!
//! The game engine and the AI run off-chain. This contract holds the money and
//! makes every hand auditable:
//! 1. `commit_hand`: before the deal, the operator records sha256(server seed)
//!    AND sha256(player seed), and locks both stakes. Neither seed can change after.
//! 2. `settle_hand`: after the hand, both seeds are revealed. The contract checks
//!    each against its commitment, stores them and pays out.
//! 3. `claim_timeout`: a hand left unsettled for HAND_TIMEOUT_BLOCKS can be closed
//!    by anyone, and the player gets the whole pot. The operator can't void a hand
//!    it's losing: stalling only costs the house.
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
    /// Not settled in time: the player was paid the whole pot.
    TimedOut,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Hand {
    pub player: AccountId,
    /// Hex sha256 of the server seed, recorded before the deal.
    pub commitment: String,
    /// Hex sha256 of the player's seed, recorded before the deal.
    pub player_commitment: String,
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

/// Blocks (~1 s each on testnet) a hand may stay unsettled before anyone can close it.
pub const HAND_TIMEOUT_BLOCKS: u64 = 600;

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
        self.withdraw_to(who, amount)
    }

    /// Send NEAR from the caller's (unlocked) balance to `receiver_id`. Agents cash out
    /// this way: their only key is a function-call key limited to this method.
    pub fn withdraw_to(&mut self, receiver_id: AccountId, amount: U128) -> Promise {
        let who = env::predecessor_account_id();
        let balance = self.balance(&who);
        require!(amount.0 > 0 && amount.0 <= balance, "Not enough balance");
        self.balances.insert(who, balance - amount.0);
        Promise::new(receiver_id).transfer(NearToken::from_yoctonear(amount.0))
    }

    /// Operator adds house money.
    #[payable]
    pub fn fund_house(&mut self) -> U128 {
        self.only_operator();
        self.house += env::attached_deposit().as_yoctonear();
        U128(self.house)
    }

    /// Operator takes house profit out (to the operator account). Only free house
    /// money can go: stakes locked in committed hands aren't part of `house`.
    pub fn withdraw_house(&mut self, amount: U128) -> Promise {
        self.only_operator();
        require!(amount.0 > 0 && amount.0 <= self.house, "Not enough house balance");
        self.house -= amount.0;
        Promise::new(self.operator.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ----- hands ---------------------------------------------------------

    /// Before the deal: lock the stakes and record both seeds' hashes.
    pub fn commit_hand(
        &mut self,
        hand_id: String,
        player: AccountId,
        commitment: String,
        player_commitment: String,
        stake: U128,
    ) {
        self.only_operator();
        require!(is_hex(&hand_id, 8), "hand_id must be 8 hex characters");
        require!(
            is_hex(&commitment, 64) && is_hex(&player_commitment, 64),
            "commitments must be hex sha256"
        );
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
                player_commitment,
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

    /// After the hand: reveal the seeds and pay out. Fails if either seed
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
        require!(
            hex(&env::sha256(player_seed.as_bytes())) == hand.player_commitment,
            "Player seed doesn't match the commitment"
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

    /// A hand nobody settled within HAND_TIMEOUT_BLOCKS: anyone may close it and
    /// the player is paid the whole pot. No seeds are revealed — it wasn't settled.
    pub fn claim_timeout(&mut self, hand_id: String) {
        let mut hand = self
            .hands
            .get(&hand_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Unknown hand"));
        require!(hand.status == HandStatus::Committed, "Hand is already closed");
        require!(
            env::block_height() >= hand.committed_at + HAND_TIMEOUT_BLOCKS,
            "Hand hasn't timed out yet"
        );
        let pot = hand.stake.0 + hand.house_stake.0;
        let balance = self.balance(&hand.player);
        self.balances.insert(hand.player.clone(), balance + pot);
        hand.status = HandStatus::TimedOut;
        hand.payout = Some(U128(pot));
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
