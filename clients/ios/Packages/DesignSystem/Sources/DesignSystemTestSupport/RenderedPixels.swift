import Foundation

/// Whether two `ImageRenderer` rasterisations are the same picture.
///
/// Not byte equality, because `ImageRenderer` does not give it. The same view
/// rendered twice in one process can come back with a handful of
/// anti-aliasing bytes one level apart, and which handful depends on what the
/// process rasterised before — so a determinism check comparing bytes failed
/// whenever test ordering happened to put it in the wrong place (POPS-3637).
/// Measured on Xcode 27.0 beta 2, host toolchain, 320×240 at scale 1:
///
/// - the noise was at most 14 of 307,200 bytes, and never more than 1 level
///   apart, across every `DesignSystem` primitive and three different render
///   histories;
/// - the smallest light/dark difference among those same primitives was over
///   229,000 bytes more than 1 level apart.
///
/// A first-render warm-up does not account for it: `PopsPhoto`'s placeholder
/// keeps a 6-byte disagreement between renders long after the process is warm.
public enum RenderedPixels {
    /// The largest per-byte difference two renders of one picture are allowed.
    public static let noiseTolerance = 1

    /// `true` when `first` and `second` are the same size and no byte differs
    /// by more than ``noiseTolerance``.
    ///
    /// Only for asserting that two renders *match*. Two blank canvases match
    /// too, so a test using this still needs `.requiresCompiledColorCatalog`,
    /// and `RenderComparisonTraitScanner` reads a call to it as an equality.
    public static func drawTheSame(_ first: Data, _ second: Data) -> Bool {
        first.count == second.count
            && !zip(first, second).contains { abs(Int($0) - Int($1)) > noiseTolerance }
    }
}
