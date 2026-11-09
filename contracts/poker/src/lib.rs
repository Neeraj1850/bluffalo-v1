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

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Poker {
    /// The backend account that deals and settles hands.
    operator: AccountId,
    balances: LookupMap<AccountId, u128>,
    /// House money available to match player stakes.
    house: u128,
}

#[near]
impl Poker {
    #[init]
    pub fn new(operator: AccountId) -> Self {
        Self {
            operator,
            balances: LookupMap::new(b"b"),
            house: 0,
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

    // ----- views ---------------------------------------------------------

    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balance(&account_id))
    }

    pub fn house_balance(&self) -> U128 {
        U128(self.house)
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
