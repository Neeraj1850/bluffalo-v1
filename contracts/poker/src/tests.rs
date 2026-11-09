use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const SEED: &str = "00112233445566778899aabbccddeeff";
// printf %s 00112233445566778899aabbccddeeff | shasum -a 256
const COMMIT: &str = "5947d7c33d783f94b3b4c1a96ebc8991ed28f1b069b71e03376cba8caa98a720";
const PLAYER_SEED: &str = "ffeeddccbbaa99887766554433221100";
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

fn commit(c: &mut Poker, stake: u128) {
    call(op(), 0);
    c.commit_hand("0123abcd".into(), alice(), COMMIT.into(), U128(stake));
}

fn total(c: &Poker) -> u128 {
    c.balance_of(alice()).0 + c.house_balance().0
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
    #[should_panic(expected = "Not enough balance")]
    fn cannot_withdraw_a_locked_stake() {
        let mut c = setup();
        commit(&mut c, 8 * NEAR);
        call(alice(), 0);
        let _ = c.withdraw(U128(3 * NEAR));
    }

    #[test]
    #[should_panic(expected = "Only the operator")]
    fn only_the_operator_funds_the_house() {
        let mut c = setup();
        call(alice(), NEAR);
        c.fund_house();
    }
}

mod hands {
    use super::*;

    #[test]
    fn commit_locks_both_stakes_and_records_the_hash() {
        let mut c = setup();
        commit(&mut c, 2 * NEAR);
        assert_eq!(c.balance_of(alice()).0, 8 * NEAR);
        assert_eq!(c.house_balance().0, 98 * NEAR);
        let h = c.get_hand("0123abcd".into()).unwrap();
        assert_eq!(h.commitment, COMMIT);
        assert_eq!(h.status, HandStatus::Committed);
        assert_eq!(h.server_seed, None);
    }

    #[test]
    fn settling_pays_the_winner_and_publishes_both_seeds() {
        let mut c = setup();
        commit(&mut c, 2 * NEAR);
        // Player wins the whole pot: their 2 back plus the house's 2.
        c.settle_hand("0123abcd".into(), SEED.into(), PLAYER_SEED.into(), U128(4 * NEAR));
        assert_eq!(c.balance_of(alice()).0, 12 * NEAR);
        assert_eq!(c.house_balance().0, 98 * NEAR);
        let h = c.get_hand("0123abcd".into()).unwrap();
        assert_eq!(h.status, HandStatus::Settled);
        assert_eq!(h.server_seed.as_deref(), Some(SEED));
        assert_eq!(h.player_seed.as_deref(), Some(PLAYER_SEED));
        assert_eq!(h.payout, Some(U128(4 * NEAR)));
    }

    #[test]
    fn a_lost_hand_goes_to_the_house() {
        let mut c = setup();
        commit(&mut c, 2 * NEAR);
        c.settle_hand("0123abcd".into(), SEED.into(), PLAYER_SEED.into(), U128(0));
        assert_eq!(c.balance_of(alice()).0, 8 * NEAR);
        assert_eq!(c.house_balance().0, 102 * NEAR);
    }

    #[test]
    fn money_is_conserved_through_a_hand() {
        let mut c = setup();
        let before = total(&c);
        commit(&mut c, 3 * NEAR);
        c.settle_hand(
            "0123abcd".into(),
            SEED.into(),
            PLAYER_SEED.into(),
            U128(NEAR + NEAR / 2),
        );
        assert_eq!(total(&c), before);
    }

    #[test]
    #[should_panic(expected = "doesn't match the commitment")]
    fn a_different_server_seed_is_refused() {
        let mut c = setup();
        commit(&mut c, 2 * NEAR);
        c.settle_hand("0123abcd".into(), PLAYER_SEED.into(), PLAYER_SEED.into(), U128(0));
    }

    #[test]
    #[should_panic(expected = "Payout exceeds the pot")]
    fn payout_can_never_exceed_the_pot() {
        let mut c = setup();
        commit(&mut c, 2 * NEAR);
        c.settle_hand(
            "0123abcd".into(),
            SEED.into(),
            PLAYER_SEED.into(),
            U128(4 * NEAR + 1),
        );
    }

    #[test]
    #[should_panic(expected = "already settled")]
    fn a_hand_settles_once() {
        let mut c = setup();
        commit(&mut c, 2 * NEAR);
        c.settle_hand("0123abcd".into(), SEED.into(), PLAYER_SEED.into(), U128(0));
        c.settle_hand("0123abcd".into(), SEED.into(), PLAYER_SEED.into(), U128(4 * NEAR));
    }

    #[test]
    #[should_panic(expected = "Only the operator")]
    fn only_the_operator_commits() {
        let mut c = setup();
        call(alice(), 0);
        c.commit_hand("0123abcd".into(), alice(), COMMIT.into(), U128(NEAR));
    }

    #[test]
    #[should_panic(expected = "Only the operator")]
    fn only_the_operator_settles() {
        let mut c = setup();
        commit(&mut c, NEAR);
        call(alice(), 0);
        c.settle_hand("0123abcd".into(), SEED.into(), PLAYER_SEED.into(), U128(2 * NEAR));
    }

    #[test]
    #[should_panic(expected = "Player balance is too low")]
    fn stake_must_be_covered_by_the_player() {
        let mut c = setup();
        commit(&mut c, 11 * NEAR);
    }

    #[test]
    #[should_panic(expected = "House can't match")]
    fn stake_must_be_covered_by_the_house() {
        let mut c = setup();
        call(alice(), 200 * NEAR);
        c.deposit();
        commit(&mut c, 150 * NEAR);
    }

    #[test]
    #[should_panic(expected = "Hand already exists")]
    fn a_hand_id_is_used_once() {
        let mut c = setup();
        commit(&mut c, NEAR);
        commit(&mut c, NEAR);
    }

    #[test]
    #[should_panic(expected = "commitment must be a hex sha256")]
    fn malformed_commitments_are_refused() {
        let mut c = setup();
        call(op(), 0);
        c.commit_hand("0123abcd".into(), alice(), "not-a-hash".into(), U128(NEAR));
    }

    #[test]
    #[should_panic(expected = "Seeds must be 32 hex")]
    fn malformed_seeds_are_refused() {
        let mut c = setup();
        commit(&mut c, NEAR);
        c.settle_hand("0123abcd".into(), SEED.into(), "short".into(), U128(0));
    }
}
