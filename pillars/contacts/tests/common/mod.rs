use contacts::service_account_scope::ServiceAccountScopeVerifier;

pub(crate) fn service_account_scope_verifier() -> ServiceAccountScopeVerifier {
    ServiceAccountScopeVerifier::new("http://127.0.0.1:1").expect("test verifier client")
}
