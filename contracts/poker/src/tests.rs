use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const NEAR: u128 = 10u128.pow(24);

fn op() -> AccountId {
    "op.testnet".parse().unwrap()
}
fn alice() -> AccountId {
    "alice.testnet".parse().unwrap()
}

/// Act as `who`, attaching `deposit` yoctoNEAR.
fn call(who: AccountId, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(who)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
}

/// Alice has 10 NEAR deposited and the house has 100.
fn setup() -> Poker {
    call(op(), 0);
    let mut c = Poker::new(op());
    call(alice(), 10 * NEAR);
    c.deposit();
    call(op(), 100 * NEAR);
    c.fund_house();
    call(op(), 0);
    c
}

mod money {
    use super::*;

    #[test]
    fn deposit_adds_to_the_callers_balance() {
        let c = setup();
        assert_eq!(c.balance_of(alice()).0, 10 * NEAR);
        assert_eq!(c.house_balance().0, 100 * NEAR);
    }

    #[test]
    #[should_panic(expected = "Attach some NEAR")]
    fn empty_deposit_is_rejected() {
        let mut c = setup();
        call(alice(), 0);
        c.deposit();
    }

    #[test]
    fn withdraw_takes_from_the_balance() {
        let mut c = setup();
        call(alice(), 0);
        let _ = c.withdraw(U128(4 * NEAR));
        assert_eq!(c.balance_of(alice()).0, 6 * NEAR);
    }

    #[test]
    #[should_panic(expected = "Not enough balance")]
    fn cannot_withdraw_more_than_the_balance() {
        let mut c = setup();
        call(alice(), 0);
        let _ = c.withdraw(U128(11 * NEAR));
    }

    #[test]
    #[should_panic(expected = "Only the operator")]
    fn only_the_operator_funds_the_house() {
        let mut c = setup();
        call(alice(), NEAR);
        c.fund_house();
    }
}
