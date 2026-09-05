import AppCore
import FeatureAccounts
import FeaturePurchases
import FeatureReceiptCapture
import FeatureTransactions
import Testing

@testable import Pops

/// `RootCopy.name(of:)` and `symbol(for:)` fall back to the BFM's raw id and a
/// generic glyph for a feature this build has never heard of — the right
/// behaviour for that case, and indistinguishable from the wrong one
/// (POPS-2893: `FeaturePurchases` fell through the same fallback despite being
/// a feature every build in this repo knows how to draw).
///
/// So this does not compare against literals, which would drift the moment a
/// feature's name changes. It asserts the fallback is never reached for a
/// feature the shell actually renders — `RootFeature.renderable` — so a fifth
/// feature wired in without a `RootFeature.presentation` entry fails this test
/// rather than shipping its raw id under `square.grid.2x2`.
@Suite("Root copy feature presentation")
internal struct RootCopyPresentationTests {
    @Test("every renderable feature has a translated name, not its raw id")
    func everyRenderableFeatureHasATranslatedName() {
        for feature in RootFeature.renderable {
            #expect(
                RootCopy.name(of: feature) != feature.rawValue,
                Comment(
                    rawValue: "\(feature.rawValue) has no entry in RootFeature.presentation, so "
                        + "its tab reads its raw id")
            )
        }
    }

    @Test("every renderable feature has its own icon, not the generic fallback")
    func everyRenderableFeatureHasItsOwnSymbol() {
        for feature in RootFeature.renderable {
            #expect(
                RootCopy.symbol(for: feature) != "square.grid.2x2",
                Comment(
                    rawValue: "\(feature.rawValue) has no entry in RootFeature.presentation, so "
                        + "its tab draws the generic glyph")
            )
        }
    }

    @Test("purchases reads as a human label under a purchases-appropriate glyph")
    func purchasesHasARealLabelAndIcon() {
        #expect(RootCopy.name(of: FeaturePurchases.feature) == "Purchases")
        #expect(RootCopy.symbol(for: FeaturePurchases.feature) == "cart")
    }

    @Test("the nothing-available sentence names purchases as a proper noun")
    func nothingAvailableSentenceHumanisesPurchases() {
        let withheld = FeatureAvailability(id: FeaturePurchases.feature, reachability: .unavailable)

        #expect(RootCopy.nothingAvailable([withheld]) == "Purchases is not available right now.")
    }
}
