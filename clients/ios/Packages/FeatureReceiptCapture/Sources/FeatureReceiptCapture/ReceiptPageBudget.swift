import CoreGraphics

/// How large a photographed page is allowed to be before it is sent.
///
/// A receipt is read by a model, not by a person zooming in, so the useful
/// question is whether the print is still legible rather than whether the
/// picture is as good as the sensor could make it. Against that, a receipt can
/// be up to ``ReceiptPart/maxPerReceipt`` photographs in one request, taken by
/// somebody standing in a shop on whatever connection they have — so the whole
/// upload has to stay bounded, and the only place to bound it is before the
/// bytes exist.
///
/// A value rather than two constants so a test can state the rule with its own
/// numbers and not have to photograph anything to do it.
public struct ReceiptPageBudget: Hashable, Sendable {
    /// The longest a page's longer side may be, in pixels.
    public let longestEdge: CGFloat
    /// JPEG quality, 0...1.
    public let compressionQuality: CGFloat

    public init(longestEdge: CGFloat, compressionQuality: CGFloat) {
        self.longestEdge = longestEdge
        self.compressionQuality = compressionQuality
    }

    /// What a capture uses.
    ///
    /// 2400 keeps a perspective-corrected receipt's short side around 1800
    /// pixels, which leaves the smallest print on a supermarket receipt tens of
    /// pixels tall rather than a handful — the range text recognition works in
    /// — while cutting a modern phone's full-resolution page by roughly three
    /// quarters of its pixels. 0.8 is the usual knee for photographic JPEG:
    /// above it the file grows much faster than the picture improves.
    public static let standard = ReceiptPageBudget(longestEdge: 2400, compressionQuality: 0.8)

    /// What to multiply `size` by to bring it inside the budget.
    ///
    /// Never above 1. A page smaller than the budget is left exactly as it was:
    /// enlarging it would invent pixels, growing the upload while making the
    /// print no easier to read.
    public func scale(for size: CGSize) -> CGFloat {
        let longest = max(size.width, size.height)
        guard longest > longestEdge, longest > 0 else { return 1 }
        return longestEdge / longest
    }

    /// `size` brought inside the budget, keeping its proportions.
    public func fittedSize(for size: CGSize) -> CGSize {
        let scale = scale(for: size)
        guard scale < 1 else { return size }
        return CGSize(width: size.width * scale, height: size.height * scale)
    }
}
