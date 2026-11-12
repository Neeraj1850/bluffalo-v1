use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::testing_env;

const HASH: &str = "5947d7c33d783f94b3b4c1a96ebc8991ed28f1b069b71e03376cba8caa98a720";
const NEAR: u128 = 10u128.pow(24);
const ID: &str = "strat-1";

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn op() -> AccountId {
    acc("op.testnet")
}
fn creator() -> AccountId {
    acc("creator.testnet")
}
fn bob() -> AccountId {
    acc("bob.testnet")
}
fn carol() -> AccountId {
    acc("carol.testnet")
}

/// Act as `who`, attaching `deposit` yoctoNEAR.
fn call(who: AccountId, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(who)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
}

fn mint(c: &mut Market, id: &str, amount: u128, max_supply: u32) {
    call(op(), NEAR);
    c.mint(
        id.into(),
        creator(),
        U128(amount),
        "Tight".into(),
        HASH.into(),
        1000,
        max_supply,
    );
}

/// Creator holds 5 seats of ID (10% royalty) and lists 3 at 2 NEAR each.
fn setup() -> Market {
    call(op(), 0);
    let mut c = Market::new(op());
    mint(&mut c, ID, 5, 10);
    call(creator(), 1);
    c.list(ID.into(), U128(3), U128(2 * NEAR), "cheap".into());
    c
}

/// (receiver, amount) for every transfer receipt created in this call.
fn transfers() -> Vec<(String, u128)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::Transfer { deposit, .. } => {
                    Some((r.receiver_id.to_string(), deposit.as_yoctonear()))
                }
                _ => None,
            })
        })
        .collect()
}

mod mint {
    use super::*;

    #[test]
    fn emits_nep245_and_refunds_extra_storage() {
        call(op(), 0);
        let mut c = Market::new(op());
        mint(&mut c, ID, 5, 10);
        let logs = get_logs();
        assert!(logs[0].starts_with("EVENT_JSON:"));
        let ev: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&logs[0][11..]).unwrap();
        assert_eq!(ev["standard"], "nep245");
        assert_eq!(ev["version"], "1.0.0");
        assert_eq!(ev["event"], "mt_mint");
        assert_eq!(ev["data"][0]["owner_id"], "creator.testnet");
        assert_eq!(ev["data"][0]["token_ids"][0], ID);
        assert_eq!(ev["data"][0]["amounts"][0], "5");
        let t = transfers();
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].0, "op.testnet");
        assert!(t[0].1 < NEAR && t[0].1 > NEAR / 2);
        assert_eq!(c.mt_balance_of(creator(), ID.into()).0, 5);
        assert_eq!(c.mt_supply(ID.into()).unwrap().0, 5);
    }

    #[test]
    #[should_panic(expected = "for storage")]
    fn requires_storage() {
        call(op(), 0);
        let mut c = Market::new(op());
        c.mint(
            ID.into(),
            creator(),
            U128(5),
            "Tight".into(),
            HASH.into(),
            1000,
            10,
        );
    }

    #[test]
    #[should_panic(expected = "Only the operator")]
    fn operator_only() {
        call(op(), 0);
        let mut c = Market::new(op());
        call(bob(), NEAR);
        c.mint(ID.into(), bob(), U128(5), "Tight".into(), HASH.into(), 1000, 10);
    }

    #[test]
    #[should_panic(expected = "max_supply must be 1-100")]
    fn supply_cap() {
        call(op(), 0);
        let mut c = Market::new(op());
        mint(&mut c, ID, 5, 101);
    }

    #[test]
    #[should_panic(expected = "Royalty above 25%")]
    fn royalty_cap() {
        call(op(), 0);
        let mut c = Market::new(op());
        call(op(), NEAR);
        c.mint(ID.into(), creator(), U128(1), "T".into(), HASH.into(), 2501, 10);
    }

    #[test]
    #[should_panic(expected = "Title must be 1-32")]
    fn title_cap() {
        call(op(), 0);
        let mut c = Market::new(op());
        call(op(), NEAR);
        c.mint(ID.into(), creator(), U128(1), "x".repeat(33), HASH.into(), 0, 10);
    }

    #[test]
    #[should_panic(expected = "Exceeds max_supply")]
    fn later_mints_stay_under_max_supply() {
        let mut c = setup();
        mint(&mut c, ID, 5, 10);
        assert_eq!(c.mt_supply(ID.into()).unwrap().0, 10);
        mint(&mut c, ID, 1, 10);
    }
}

mod sale {
    use super::*;

    #[test]
    fn primary_sale_pays_creator_without_royalty_and_refunds() {
        let mut c = setup();
        call(bob(), 5 * NEAR);
        c.buy(ID.into(), creator(), U128(2));
        assert_eq!(
            transfers(),
            vec![("creator.testnet".into(), 4 * NEAR), ("bob.testnet".into(), NEAR)]
        );
        assert_eq!(c.mt_balance_of(bob(), ID.into()).0, 2);
        assert_eq!(c.mt_balance_of(creator(), ID.into()).0, 3);
        assert_eq!(c.listings(None, None)[0].listing.amount, 1);
        assert!(get_logs()[1].contains("\"event\":\"sale\""));
    }

    #[test]
    fn resale_splits_royalty_to_creator() {
        let mut c = setup();
        call(bob(), 6 * NEAR);
        c.buy(ID.into(), creator(), U128(3));
        assert!(c.listings(None, None).is_empty());
        call(bob(), 1);
        c.list(ID.into(), U128(1), U128(10 * NEAR), "flip".into());
        call(carol(), 10 * NEAR);
        c.buy(ID.into(), bob(), U128(1));
        assert_eq!(
            transfers(),
            vec![("bob.testnet".into(), 9 * NEAR), ("creator.testnet".into(), NEAR)]
        );
    }

    #[test]
    #[should_panic(expected = "Can't buy from yourself")]
    fn self_buy_panics() {
        let mut c = setup();
        call(creator(), 10 * NEAR);
        c.buy(ID.into(), creator(), U128(1));
    }

    #[test]
    #[should_panic(expected = "Seller no longer holds")]
    fn stale_listing_panics() {
        let mut c = setup();
        call(creator(), 1);
        c.mt_transfer(carol(), ID.into(), U128(4), None, None);
        call(bob(), 10 * NEAR);
        c.buy(ID.into(), creator(), U128(3));
    }

    #[test]
    #[should_panic(expected = "below the price")]
    fn underpay_panics() {
        let mut c = setup();
        call(bob(), 2 * NEAR - 1);
        c.buy(ID.into(), creator(), U128(1));
    }

    #[test]
    fn delist_removes_listing() {
        let mut c = setup();
        call(creator(), 1);
        c.delist(ID.into());
        assert!(c.listings(None, None).is_empty());
    }
}

mod transfer {
    use super::*;

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn needs_one_yocto() {
        let mut c = setup();
        call(creator(), 0);
        c.mt_transfer(bob(), ID.into(), U128(1), None, None);
    }

    #[test]
    fn moves_seats_and_emits() {
        let mut c = setup();
        call(creator(), 1);
        c.mt_batch_transfer(bob(), vec![ID.into()], vec![U128(5)], None, None);
        assert_eq!(c.mt_batch_balance_of(bob(), vec![ID.into()])[0].0, 5);
        assert_eq!(c.mt_balance_of(creator(), ID.into()).0, 0);
        assert!(
            c.listings(None, None).is_empty(),
            "zero balance drops the listing"
        );
        assert!(get_logs()[0].contains("\"event\":\"mt_transfer\""));
    }
}

mod license {
    use super::*;

    fn agent() -> AccountId {
        acc("agent-1.op.testnet")
    }

    #[test]
    fn burns_a_seat_and_binds_the_agent() {
        let mut c = setup();
        call(creator(), 1);
        c.use_license(ID.into(), agent());
        assert_eq!(c.mt_balance_of(creator(), ID.into()).0, 4);
        assert_eq!(c.mt_supply(ID.into()).unwrap().0, 4);
        assert_eq!(c.strategy_of(agent()), Some(ID.to_string()));
        let logs = get_logs();
        assert!(logs[0].contains("\"event\":\"mt_burn\""));
        assert!(logs[1].contains("\"event\":\"license_used\""));
    }

    #[test]
    #[should_panic(expected = "already has a strategy")]
    fn binding_twice_panics() {
        let mut c = setup();
        call(creator(), 1);
        c.use_license(ID.into(), agent());
        c.use_license(ID.into(), agent());
    }

    #[test]
    #[should_panic(expected = "operator sub-account")]
    fn agent_must_be_operator_sub_account() {
        let mut c = setup();
        call(creator(), 1);
        c.use_license(ID.into(), acc("agent-1.evil.testnet"));
    }
}
