//! Bluffalo — strategy licence market (NEP-245 multi-token).
//!
//! Each token id is one published strategy; each unit is one seat (licence).
//! The operator mints seats for the creator. Holders transfer, list and sell
//! seats here; a buyer pays the seller, the creator takes a royalty on resales.
//! `use_license` burns one seat and binds it to an agent account for good.
//!
//! The contract never holds NEAR beyond storage: a sale pays out in the same
//! call with plain transfers, no callbacks.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

pub const MAX_TOKENS: u32 = 500;
pub const MAX_SUPPLY: u32 = 100;
pub const MAX_ROYALTY_BPS: u16 = 2500;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Strategy {
    pub creator_id: AccountId,
    pub title: String,
    /// Hex sha256 of the (secret, salted) strategy params, held off-chain.
    pub params_hash: String,
    pub royalty_bps: u16,
    pub max_supply: u32,
    /// Seats ever minted.
    pub minted: u32,
    /// Seats in circulation (minted − burned).
    pub supply: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Listing {
    pub amount: u32,
    /// yoctoNEAR per seat.
    pub price_each: U128,
    pub memo: String,
}

#[near(serializers = [json])]
pub struct StrategyView {
    pub token_id: String,
    #[serde(flatten)]
    pub strategy: Strategy,
}

#[near(serializers = [json])]
pub struct ListingView {
    pub token_id: String,
    pub seller_id: AccountId,
    #[serde(flatten)]
    pub listing: Listing,
}

/// NEP-245 `Token` (owner_id is None: seats have many owners).
#[near(serializers = [json])]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct MtContractMetadata {
    pub spec: String,
    pub name: String,
}

#[near(serializers = [json])]
pub struct MtBaseTokenMetadata {
    pub name: String,
    pub id: String,
    pub symbol: Option<String>,
    pub icon: Option<String>,
    pub decimals: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub copies: Option<u64>,
    pub reference_hash: Option<String>,
}

#[near(serializers = [json])]
pub struct MtTokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    /// JSON: {"creator_id","params_hash","royalty_bps"}
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[near(serializers = [json])]
pub struct MtTokenMetadataAll {
    pub base: MtBaseTokenMetadata,
    pub token: MtTokenMetadata,
}

// ----- events ------------------------------------------------------------

#[near(serializers = [json])]
pub struct MtMintLog {
    pub owner_id: AccountId,
    pub token_ids: Vec<String>,
    pub amounts: Vec<U128>,
    pub memo: Option<String>,
}

#[near(serializers = [json])]
pub struct MtTransferLog {
    pub old_owner_id: AccountId,
    pub new_owner_id: AccountId,
    pub token_ids: Vec<String>,
    pub amounts: Vec<U128>,
    pub authorized_id: Option<AccountId>,
    pub memo: Option<String>,
}

#[near(serializers = [json])]
pub struct MtBurnLog {
    pub owner_id: AccountId,
    pub token_ids: Vec<String>,
    pub amounts: Vec<U128>,
    pub authorized_id: Option<AccountId>,
    pub memo: Option<String>,
}

#[near(event_json(standard = "nep245"))]
pub enum MtEvent {
    #[event_version("1.0.0")]
    MtMint(Vec<MtMintLog>),
    #[event_version("1.0.0")]
    MtTransfer(Vec<MtTransferLog>),
    #[event_version("1.0.0")]
    MtBurn(Vec<MtBurnLog>),
}

#[near(event_json(standard = "bluffalo_market"))]
pub enum MarketEvent {
    #[event_version("1.0.0")]
    Listed {
        token_id: String,
        seller_id: AccountId,
        amount: u32,
        price_each: U128,
        memo: String,
    },
    #[event_version("1.0.0")]
    Delisted { token_id: String, seller_id: AccountId },
    #[event_version("1.0.0")]
    Sale {
        token_id: String,
        seller_id: AccountId,
        buyer_id: AccountId,
        amount: u32,
        price_each: U128,
        total: U128,
        royalty: U128,
    },
    #[event_version("1.0.0")]
    LicenseUsed {
        token_id: String,
        owner_id: AccountId,
        agent_id: AccountId,
    },
}

// ----- contract ----------------------------------------------------------

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Market {
    operator: AccountId,
    tokens: IterableMap<String, Strategy>,
    balances: LookupMap<(String, AccountId), u32>,
    listings: IterableMap<(String, AccountId), Listing>,
    agent_strategy: LookupMap<AccountId, String>,
}

fn is_hex(s: &str, len: usize) -> bool {
    s.len() == len
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_token_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn amount_u32(a: U128) -> u32 {
    require!(a.0 > 0 && a.0 <= u32::MAX as u128, "Amount must be positive");
    a.0 as u32
}

fn page<T>(it: impl Iterator<Item = T>, from_index: Option<u32>, limit: Option<u32>) -> Vec<T> {
    it.skip(from_index.unwrap_or(0) as usize)
        .take(limit.unwrap_or(50).min(100) as usize)
        .collect()
}

fn pay(to: &AccountId, yocto: u128) {
    if yocto > 0 {
        Promise::new(to.clone())
            .transfer(NearToken::from_yoctonear(yocto))
            .detach();
    }
}

#[near]
impl Market {
    #[init]
    pub fn new(operator: AccountId) -> Self {
        Self {
            operator,
            tokens: IterableMap::new(b"t"),
            balances: LookupMap::new(b"b"),
            listings: IterableMap::new(b"l"),
            agent_strategy: LookupMap::new(b"a"),
        }
    }

    // ----- mint ----------------------------------------------------------

    /// Operator mints `amount` seats of `token_id` to `owner_id` (the creator on
    /// the first mint). Attach enough NEAR for the storage used; the rest is
    /// refunded to the operator. Later mints of an id must repeat its params_hash.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn mint(
        &mut self,
        token_id: String,
        owner_id: AccountId,
        amount: U128,
        title: String,
        params_hash: String,
        royalty_bps: u16,
        max_supply: u32,
    ) {
        self.only_operator();
        let before = env::storage_usage();
        let amount = amount_u32(amount);
        require!(is_token_id(&token_id), "Bad token_id");
        let mut s = match self.tokens.get(&token_id) {
            Some(s) => {
                require!(
                    s.params_hash == params_hash,
                    "params_hash doesn't match the token"
                );
                s.clone()
            }
            None => {
                require!(self.tokens.len() < MAX_TOKENS, "Too many strategies");
                require!(
                    !title.is_empty() && title.chars().count() <= 32,
                    "Title must be 1-32 characters"
                );
                require!(is_hex(&params_hash, 64), "params_hash must be hex sha256");
                require!(royalty_bps <= MAX_ROYALTY_BPS, "Royalty above 25%");
                require!(
                    max_supply > 0 && max_supply <= MAX_SUPPLY,
                    "max_supply must be 1-100"
                );
                Strategy {
                    creator_id: owner_id.clone(),
                    title,
                    params_hash,
                    royalty_bps,
                    max_supply,
                    minted: 0,
                    supply: 0,
                }
            }
        };
        let minted = s.minted.saturating_add(amount);
        require!(minted <= s.max_supply, "Exceeds max_supply");
        s.minted = minted;
        s.supply += amount;
        self.tokens.insert(token_id.clone(), s);
        self.add(&token_id, &owner_id, amount);
        self.tokens.flush();
        self.balances.flush();

        let cost =
            env::storage_byte_cost().as_yoctonear() * u128::from(env::storage_usage().saturating_sub(before));
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= cost,
            format!("Attach at least {cost} yoctoNEAR for storage")
        );
        MtEvent::MtMint(vec![MtMintLog {
            owner_id,
            token_ids: vec![token_id],
            amounts: vec![U128(amount.into())],
            memo: None,
        }])
        .emit();
        pay(&self.operator, attached - cost);
    }

    // ----- NEP-245 core --------------------------------------------------

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        self.mt_batch_transfer(
            receiver_id,
            vec![token_id],
            vec![amount],
            approval.map(|a| vec![Some(a)]),
            memo,
        )
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        near_sdk::assert_one_yocto();
        require!(
            approvals.is_none_or(|a| a.iter().all(Option::is_none)),
            "Approvals are not supported"
        );
        require!(
            !token_ids.is_empty() && token_ids.len() == amounts.len(),
            "token_ids and amounts must match"
        );
        let sender = env::predecessor_account_id();
        require!(sender != receiver_id, "Can't transfer to yourself");
        for (id, a) in token_ids.iter().zip(&amounts) {
            let a = amount_u32(*a);
            self.sub(id, &sender, a);
            self.add(id, &receiver_id, a);
        }
        MtEvent::MtTransfer(vec![MtTransferLog {
            old_owner_id: sender,
            new_owner_id: receiver_id,
            token_ids,
            amounts,
            authorized_id: None,
            memo,
        }])
        .emit();
    }

    #[payable]
    #[allow(unused_variables)]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) {
        env::panic_str("unsupported")
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.balance(&token_id, &account_id).into())
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .iter()
            .map(|id| U128(self.balance(id, &account_id).into()))
            .collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.tokens.get(&token_id).map(|s| U128(s.supply.into()))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|id| self.mt_supply(id)).collect()
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids
            .into_iter()
            .map(|id| {
                self.tokens.contains_key(&id).then_some(Token {
                    token_id: id,
                    owner_id: None,
                })
            })
            .collect()
    }

    pub fn mt_metadata_contract(&self) -> MtContractMetadata {
        MtContractMetadata {
            spec: "mt-1.0.0".into(),
            name: "Bluffalo strategy seats".into(),
        }
    }

    pub fn mt_metadata_token_all(&self, token_ids: Vec<String>) -> Vec<Option<MtTokenMetadataAll>> {
        token_ids
            .into_iter()
            .map(|id| {
                let s = self.tokens.get(&id)?;
                let extra = near_sdk::serde_json::json!({
                    "creator_id": s.creator_id,
                    "params_hash": s.params_hash,
                    "royalty_bps": s.royalty_bps,
                })
                .to_string();
                Some(MtTokenMetadataAll {
                    base: MtBaseTokenMetadata {
                        name: s.title.clone(),
                        id: id.clone(),
                        symbol: None,
                        icon: None,
                        decimals: Some("0".into()),
                        base_uri: None,
                        reference: None,
                        copies: Some(s.max_supply.into()),
                        reference_hash: None,
                    },
                    token: MtTokenMetadata {
                        title: Some(s.title.clone()),
                        description: None,
                        media: None,
                        media_hash: None,
                        issued_at: None,
                        expires_at: None,
                        starts_at: None,
                        updated_at: None,
                        extra: Some(extra),
                        reference: None,
                        reference_hash: None,
                    },
                })
            })
            .collect()
    }

    // ----- market --------------------------------------------------------

    /// List `amount` seats at `price_each` yoctoNEAR. Replaces the caller's listing.
    #[payable]
    pub fn list(&mut self, token_id: String, amount: U128, price_each: U128, memo: String) {
        near_sdk::assert_one_yocto();
        let amount = amount_u32(amount);
        require!(price_each.0 > 0, "Price must be positive");
        require!(memo.chars().count() <= 140, "Memo is over 140 characters");
        let seller = env::predecessor_account_id();
        require!(self.balance(&token_id, &seller) >= amount, "Not enough seats");
        self.listings.insert(
            (token_id.clone(), seller.clone()),
            Listing {
                amount,
                price_each,
                memo: memo.clone(),
            },
        );
        MarketEvent::Listed {
            token_id,
            seller_id: seller,
            amount,
            price_each,
            memo,
        }
        .emit();
    }

    #[payable]
    pub fn delist(&mut self, token_id: String) {
        near_sdk::assert_one_yocto();
        let seller = env::predecessor_account_id();
        require!(
            self.listings
                .remove(&(token_id.clone(), seller.clone()))
                .is_some(),
            "Not listed"
        );
        MarketEvent::Delisted {
            token_id,
            seller_id: seller,
        }
        .emit();
    }

    /// Buy `amount` listed seats. The attached deposit is the max you'll pay:
    /// the seller is paid, the creator gets the royalty (on resales), the excess
    /// is refunded.
    #[payable]
    pub fn buy(&mut self, token_id: String, seller_id: AccountId, amount: U128) {
        let amount = amount_u32(amount);
        let buyer = env::predecessor_account_id();
        require!(buyer != seller_id, "Can't buy from yourself");
        let key = (token_id.clone(), seller_id.clone());
        let mut listing = self
            .listings
            .get(&key)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Not listed"));
        require!(listing.amount >= amount, "Listing has fewer seats");
        require!(
            self.balance(&token_id, &seller_id) >= amount,
            "Seller no longer holds the seats"
        );
        let total = listing
            .price_each
            .0
            .checked_mul(amount.into())
            .unwrap_or_else(|| env::panic_str("Price overflow"));
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= total, "Attached deposit is below the price");
        let s = self.tokens.get(&token_id).unwrap();
        let creator = s.creator_id.clone();
        let royalty = if seller_id == creator {
            0
        } else {
            total * u128::from(s.royalty_bps) / 10_000
        };

        listing.amount -= amount;
        if listing.amount == 0 {
            self.listings.remove(&key);
        } else {
            self.listings.insert(key, listing.clone());
        }
        self.sub(&token_id, &seller_id, amount);
        self.add(&token_id, &buyer, amount);

        MtEvent::MtTransfer(vec![MtTransferLog {
            old_owner_id: seller_id.clone(),
            new_owner_id: buyer.clone(),
            token_ids: vec![token_id.clone()],
            amounts: vec![U128(amount.into())],
            authorized_id: None,
            memo: Some("sale".into()),
        }])
        .emit();
        MarketEvent::Sale {
            token_id,
            seller_id: seller_id.clone(),
            buyer_id: buyer.clone(),
            amount,
            price_each: listing.price_each,
            total: U128(total),
            royalty: U128(royalty),
        }
        .emit();

        pay(&seller_id, total - royalty);
        pay(&creator, royalty);
        pay(&buyer, attached - total);
    }

    /// Burn one of the caller's seats and bind the strategy to `agent_id`
    /// (an operator sub-account) for good.
    #[payable]
    pub fn use_license(&mut self, token_id: String, agent_id: AccountId) {
        near_sdk::assert_one_yocto();
        require!(
            agent_id.as_str().ends_with(&format!(".{}", self.operator)),
            "Agent must be an operator sub-account"
        );
        require!(
            !self.agent_strategy.contains_key(&agent_id),
            "Agent already has a strategy"
        );
        let owner = env::predecessor_account_id();
        self.sub(&token_id, &owner, 1);
        let mut s = self.tokens.get(&token_id).cloned().unwrap();
        s.supply -= 1;
        self.tokens.insert(token_id.clone(), s);
        self.agent_strategy.insert(agent_id.clone(), token_id.clone());

        MtEvent::MtBurn(vec![MtBurnLog {
            owner_id: owner.clone(),
            token_ids: vec![token_id.clone()],
            amounts: vec![U128(1)],
            authorized_id: None,
            memo: Some(format!("license:{agent_id}")),
        }])
        .emit();
        MarketEvent::LicenseUsed {
            token_id,
            owner_id: owner,
            agent_id,
        }
        .emit();
    }

    // ----- views ---------------------------------------------------------

    pub fn strategies(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<StrategyView> {
        page(
            self.tokens.iter().map(|(id, s)| StrategyView {
                token_id: id.clone(),
                strategy: s.clone(),
            }),
            from_index,
            limit,
        )
    }

    pub fn listings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<ListingView> {
        page(
            self.listings.iter().map(|((id, seller), l)| ListingView {
                token_id: id.clone(),
                seller_id: seller.clone(),
                listing: l.clone(),
            }),
            from_index,
            limit,
        )
    }

    pub fn strategy_of(&self, agent_id: AccountId) -> Option<String> {
        self.agent_strategy.get(&agent_id).cloned()
    }

    pub fn operator(&self) -> AccountId {
        self.operator.clone()
    }

    // ----- internal ------------------------------------------------------

    fn balance(&self, token_id: &str, who: &AccountId) -> u32 {
        self.balances
            .get(&(token_id.to_string(), who.clone()))
            .copied()
            .unwrap_or(0)
    }

    fn add(&mut self, token_id: &str, who: &AccountId, amount: u32) {
        let b = self.balance(token_id, who) + amount;
        self.balances.insert((token_id.to_string(), who.clone()), b);
    }

    fn sub(&mut self, token_id: &str, who: &AccountId, amount: u32) {
        let b = self.balance(token_id, who);
        require!(b >= amount, "Not enough seats");
        let key = (token_id.to_string(), who.clone());
        if b == amount {
            self.balances.remove(&key);
            self.listings.remove(&key);
        } else {
            self.balances.insert(key, b - amount);
        }
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
