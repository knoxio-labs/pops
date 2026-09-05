import AppCore

/// The receipt-capture screen: photograph or paste a receipt, and let the
/// purchases pillar's model turn it into a purchase.
///
/// The imports across this module are the whole of what a feature may reach
/// for: the seams in `AppCore`, the tokens and primitives in `DesignSystem`.
/// `Auth` and `BFMClient` are deliberately absent — this reads a
/// `ReceiptCaptureRepository`, and only the composition root knows that the
/// thing behind it attaches a device token and speaks HTTP to a BFM.
public enum FeatureReceiptCapture {
    public static let moduleName = "FeatureReceiptCapture"

    /// Which of the BFM's features this module draws.
    ///
    /// Declared here rather than in the composition root so the claim lives
    /// with the code that makes it good — the root then holds a list of
    /// modules rather than a list of strings it has to keep in step with
    /// them.
    public static let feature: MobileFeature = .receiptCapture

    /// The tab bar's label for this feature.
    public static let displayName = "Receipts"

    /// The tab bar's icon for this feature.
    public static let symbolName = "doc.text.viewfinder"
}
