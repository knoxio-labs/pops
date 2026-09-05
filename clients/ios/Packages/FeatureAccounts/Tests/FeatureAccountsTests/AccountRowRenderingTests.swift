import AppCoreFakes
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeatureAccounts

/// The row draws its name at every text size, and stops drawing it side by
/// side with the balance at the sizes where side by side stopped working.
///
/// Same technique and the same reasoning as `DesignSystem`'s
/// `PrimitiveRenderingTests`: nothing in CI opens Xcode's canvas, so the view
/// is rasterised here instead. The unit rendered is the row rather than a
/// screen, per POPS-2500's limits on `ImageRenderer`.
@Suite("Account row rendering")
@MainActor
internal struct AccountRowRenderingTests {
    private static let canvas = CGSize(width: 320, height: 420)

    /// Two names that differ only after the first word. That is what makes
    /// the comparisons below about the *name column* rather than about any
    /// two different strings: a column squeezed to its first character or two
    /// draws these identically, and a column with room draws them apart.
    private static let firstName = "Everyday spending"
    private static let secondName = "Everyday offsetting"

    private static func row(named name: String) -> some View {
        AccountRowView(account: .fake(name: name))
    }

    private static func render(
        _ view: some View,
        at size: DynamicTypeSize,
        in scheme: ColorScheme = .light
    ) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .dynamicTypeSize(size)
                .environment(\.colorScheme, scheme)
                .frame(width: canvas.width, height: canvas.height)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    @Test("a row rasterises")
    func rowRasterises() throws {
        _ = try #require(Self.render(Self.row(named: Self.firstName), at: .large))
    }

    /// What makes every comparison below a signal rather than noise.
    @Test("a row renders the same way twice", .requiresCompiledColorCatalog)
    func rowRendersDeterministically() throws {
        let once = try #require(Self.render(Self.row(named: Self.firstName), at: .large))
        let again = try #require(Self.render(Self.row(named: Self.firstName), at: .large))

        #expect(once == again)
    }

    /// The control for the accessibility-size test below: at the default size
    /// these two names are drawn apart, so a failure there is the size's doing
    /// and not the fixture's.
    @Test("two names are drawn apart at the default text size", .requiresCompiledColorCatalog)
    func namesAreDistinctAtTheDefaultSize() throws {
        let first = try #require(Self.render(Self.row(named: Self.firstName), at: .large))
        let second = try #require(Self.render(Self.row(named: Self.secondName), at: .large))

        #expect(first != second)
    }

    /// POPS-2900. The row used to hold its two columns at every size, giving
    /// the balance `.layoutPriority(1)` and letting the name take whatever was
    /// left; at `.accessibility5` what was left was about one character, so
    /// every account whose name began the same way drew the same picture. This
    /// fails against that layout and passes against the stacked one.
    ///
    /// iOS only, and the conditional is the honest kind rather than a
    /// convenience — the same one `TransactionRowRenderingTests` draws: macOS
    /// has no Dynamic Type, so `dynamicTypeSize` changes nothing there and the
    /// assertion would be measuring the platform rather than the row.
    #if os(iOS)
        @Test(
            "the name is still drawn at the largest accessibility text size",
            .requiresCompiledColorCatalog)
        func nameSurvivesAccessibilitySizes() throws {
            let first = try #require(
                Self.render(Self.row(named: Self.firstName), at: .accessibility5))
            let second = try #require(
                Self.render(Self.row(named: Self.secondName), at: .accessibility5))

            #expect(
                first != second,
                """
                two accounts sharing a first word rendered identically at AX5 — the name \
                column has collapsed to its first characters
                """
            )
        }
    #endif
}

/// The layout rule itself, at the tier that can state it without a raster.
@Suite("Account row layout")
internal struct AccountRowLayoutTests {
    @Test("the row keeps two columns at the non-accessibility sizes")
    func sideBySideBelowAccessibility() {
        for size in DynamicTypeSize.allCases where !size.isAccessibilitySize {
            #expect(
                !AccountRowLayout.stacks(at: size),
                Comment(rawValue: "\(size) should not stack"))
        }
    }

    @Test("the row stacks at every accessibility size")
    func stacksAtAccessibilitySizes() {
        for size in DynamicTypeSize.allCases where size.isAccessibilitySize {
            #expect(AccountRowLayout.stacks(at: size), Comment(rawValue: "\(size) should stack"))
        }
    }
}
