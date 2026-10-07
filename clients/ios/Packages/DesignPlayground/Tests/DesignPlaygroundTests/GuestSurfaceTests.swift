import FeatureAccounts
import FeaturePurchases
import FeatureTransactions
import Testing

@testable import DesignPlayground

@Suite("Guest surfaces")
@MainActor
internal struct GuestSurfaceTests {
    private func states(_ slug: String) -> Set<String> {
        let surface = Catalog.surfaces.first { $0.id.description == "guest/\(slug)" }
        return Set(surface?.states.map(\.id) ?? [])
    }

    @Test("a guest's tab bar holds transactions and accounts and nothing else")
    func guestTabsAreTheTwoGrantedFeatures() {
        #expect(
            guestShellTabs.map(\.id) == [
                FeatureTransactions.feature.rawValue, FeatureAccounts.feature.rawValue,
            ])
        #expect(!guestShellTabs.contains { $0.id == FeaturePurchases.feature.rawValue })
    }

    @Test("every guest surface is in the catalogue")
    func surfacesAreRegistered() {
        let registered = Set(Catalog.surfaces.map(\.id.description))

        for surface in GuestSurfaces.surfaces {
            #expect(registered.contains(surface.id.description))
        }
        #expect(GuestSurfaces.surfaces.count == 8)
    }

    @Test("the session states the guest can land in are all staged")
    func sessionStates() {
        #expect(
            states("shell").isSuperset(of: ["default", "nothing-shared", "offline", "unpaired"]))
        #expect(states("accounts").isSuperset(of: ["nothing-shared", "offline"]))
        #expect(states("account").isSuperset(of: ["view-only", "offline", "revoked"]))
    }

    @Test("the form stages saving, each way a save fails, and a read-only role")
    func formStates() {
        #expect(
            states("transaction-form").isSuperset(of: [
                "new", "edit", "problems", "saving", "save-failed", "offline", "access-revoked",
                "read-only",
            ]))
    }

    @Test("receipt attach stages every outcome of reading one")
    func receiptStates() {
        #expect(
            states("receipt").isSuperset(of: [
                "reading", "suggested", "several-pages", "unreadable", "unavailable",
                "currency-mismatch",
            ]))
    }

    @Test("attachments and both logs are staged")
    func attachmentAndHistoryStates() {
        #expect(states("transaction").isSuperset(of: ["default", "viewer-photo", "viewer-pdf"]))
        #expect(!states("transaction-history").isEmpty)
        #expect(!states("account-activity").isEmpty)
    }

    @Test("a page count reads as a count")
    func pageCounts() {
        #expect(GuestCopy.pageCount(1) == "1 page")
        #expect(GuestCopy.pageCount(3) == "3 pages")
        #expect(GuestAttachmentCopy.detail(GuestFixtures.pdfReceipt) == "PDF · 3 pages")
        #expect(GuestAttachmentCopy.detail(GuestFixtures.photoReceipt) == "Photo")
        #expect(GuestAttachmentCopy.position(page: 1, of: 3) == "Page 2 of 3")
        #expect(GuestAttachmentCopy.position(page: 0, of: 1).isEmpty)
    }
}
