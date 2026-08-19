import AppCore
import Foundation
import SwiftUI
import Testing

@testable import FeatureReceiptCapture

/// Proof that every identifier ``ReceiptResultAccessibility`` declares is
/// actually attached to something drawn, not merely a string sitting beside
/// the screen that draws it.
///
/// A declared-but-unattached identifier is worse than no identifier at all —
/// it reads as coverage a Maestro flow could lean on, and fails silently the
/// first time it does. So this does not read `ReceiptResultCard` or
/// `ReceiptResultView`'s source; it mounts the real view in a
/// `UIHostingController`, the same starting point `ContentViewTabSwitcherTests`
/// uses to prove a tab bar is or is not built, and walks the accessibility
/// tree UIKit actually produces from it.
///
/// iOS only: `UIHostingController` and the whole `UIAccessibilityContainer`
/// walk need UIKit, which the host-toolchain macOS build of this package
/// does not have — see `Package.swift` for why that build exists at all.
#if os(iOS)
    import UIKit

    @Suite("Receipt result accessibility identifiers")
    @MainActor
    internal struct ReceiptResultAccessibilityTests {
        private static let canvas = CGSize(width: 390, height: 844)
        private static let presentation = ReceiptResultPresentation()
        private static let parts = [ReceiptPart(mediaType: .jpeg, data: Data([0x01]))]

        /// Every `accessibilityIdentifier` reachable from `view`, found the
        /// way XCUITest and Maestro find them: walking the
        /// `UIAccessibilityContainer` tree UIKit builds for a mounted
        /// `UIHostingController`, not `view.subviews` — SwiftUI text and
        /// buttons are not distinct `UIView`s, so a subview-only walk would
        /// see none of them.
        ///
        /// No `UIWindow`: this suite runs as a SwiftPM package test bundle,
        /// which `xcodebuild test` hosts in a bare XCTest runner rather than
        /// the actual `Pops` app — measured, `UIApplication.shared.connectedScenes`
        /// is empty there, so there is no scene for a `UIWindow(windowScene:)`
        /// to attach to, and the pre-iOS-26 `UIWindow(frame:)` is deprecated.
        /// Sizing and laying out the hosting controller's own view directly is
        /// enough: `accessibilityElementCount()`/`accessibilityElement(at:)`
        /// are answered by the view tree itself, not by screen presence.
        private static func identifiers(mounting view: some View) -> Set<String> {
            let hosting = UIHostingController(
                rootView: view.frame(width: canvas.width, height: canvas.height))
            hosting.view.frame = CGRect(origin: .zero, size: canvas)
            hosting.view.setNeedsLayout()
            hosting.view.layoutIfNeeded()

            var found = Set<String>()
            collect(from: hosting.view, into: &found)
            return found
        }

        private static func collect(from object: NSObject, into found: inout Set<String>) {
            if let identified = object as? UIAccessibilityIdentification,
                let identifier = identified.accessibilityIdentifier
            {
                found.insert(identifier)
            }
            let count = object.accessibilityElementCount()
            if count != NSNotFound {
                for index in 0..<count {
                    if let child = object.accessibilityElement(at: index) as? NSObject {
                        collect(from: child, into: &found)
                    }
                }
            }
            if let view = object as? UIView {
                for subview in view.subviews {
                    collect(from: subview, into: &found)
                }
            }
        }

        private static func card(_ outcome: ReceiptOutcome) -> some View {
            ReceiptResultCard(content: presentation.content(outcome))
        }

        @Test("the created outcome carries its identifier, and only its own")
        func createdCarriesItsIdentifier() {
            let found = Self.identifiers(
                mounting: Self.card(
                    .created(purchase: .fake(id: "purchase-1"), alreadyStored: false)))

            #expect(found.contains(ReceiptResultAccessibility.created))
            #expect(!found.contains(ReceiptResultAccessibility.needsReview))
            #expect(!found.contains(ReceiptResultAccessibility.unreadable))
        }

        @Test("the needs-review outcome carries its identifier, and only its own")
        func needsReviewCarriesItsIdentifier() {
            let found = Self.identifiers(
                mounting: Self.card(
                    .needsReview(receiptCount: 1, failures: [.fake()], extracted: .fake())))

            #expect(found.contains(ReceiptResultAccessibility.needsReview))
            #expect(!found.contains(ReceiptResultAccessibility.created))
            #expect(!found.contains(ReceiptResultAccessibility.unreadable))
        }

        @Test("the unreadable outcome carries its identifier, and only its own")
        func unreadableCarriesItsIdentifier() {
            let found = Self.identifiers(
                mounting: Self.card(.unreadable(receiptCount: 1, reason: "blank image")))

            #expect(found.contains(ReceiptResultAccessibility.unreadable))
            #expect(!found.contains(ReceiptResultAccessibility.created))
            #expect(!found.contains(ReceiptResultAccessibility.needsReview))
        }

        /// Rendered through `content`, not `body` — `body` carries the
        /// `.task` that submits the receipt, and the model already opens on
        /// `.submitting` without it. Going through `body` here would mean
        /// mounting a real async call this test has no way to hold open.
        @Test("the submitting state carries its identifier")
        func submittingCarriesItsIdentifier() {
            let model = ReceiptResultViewModel(parts: Self.parts, dependencies: .unbound)
            let view = ReceiptResultView(model: model)

            #expect(model.state == .submitting)
            let found = Self.identifiers(mounting: view.content)
            #expect(found.contains(ReceiptResultAccessibility.submitting))
        }

        /// The model is driven to `.failed` before the view is even built, so
        /// nothing here depends on `.task` firing or on racing a real retry —
        /// `content` reads whatever state the model already holds.
        @Test("the failed state's retry control carries its identifier")
        func failedRetryCarriesItsIdentifier() async {
            let model = ReceiptResultViewModel(parts: Self.parts, dependencies: .unbound)
            await model.submit()
            #expect(model.state == .failed(.dependencyNotBound))

            let view = ReceiptResultView(model: model)

            let found = Self.identifiers(mounting: view.content)
            #expect(found.contains(ReceiptResultAccessibility.retryButton))
        }
    }
#endif
