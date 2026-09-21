import AppCore
import DesignSystem
import SwiftUI

extension UniversalSearchScreen {
    /// A new query: a pillar that answers on the phone answers at once; one
    /// that asks the network keeps the rows it has, faded, until its answer
    /// lands a beat later. Offline and not-downloaded pillars stay as they
    /// are, because nothing is sent.
    internal func requery(after previous: String) {
        let isEmpty = query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        for pillar in SearchPillar.allCases {
            switch answers[pillar] ?? .current {
            case .offline, .notOnPhone:
                continue
            case .current:
                answers[pillar] = isEmpty || pillar.answersOnDevice
                    ? .current : .pending(previous: previous)
            case .pending(let earlier):
                answers[pillar] = isEmpty || pillar.answersOnDevice
                    ? .current : .pending(previous: earlier)
            case .failed:
                answers[pillar] = isEmpty || pillar.answersOnDevice
                    ? .current : .pending(previous: nil)
            }
        }
        resolveSoon()
    }

    /// Sends the query in the field again, as it is.
    internal func retry(_ pillar: SearchPillar) {
        answers[pillar] = .pending(previous: nil)
        resolveSoon()
    }

    internal func download() {
        answers[.inventory] = .pending(previous: nil)
        resolveSoon()
    }

    /// Lands every pending answer after the beat a request takes. A newer
    /// keystroke cancels the older wait, so only the latest query lands.
    private func resolveSoon() {
        resolving?.cancel()
        resolving = Task {
            try? await Task.sleep(for: InventoryMotion.stagedBeat)
            guard !Task.isCancelled else { return }
            for (pillar, answer) in answers {
                if case .pending = answer { answers[pillar] = .current }
            }
        }
    }
}

/// The search tab both shells show: one navigation stack around the
/// universal search, opened on whatever the stage has already pushed.
internal struct UniversalSearchTab: View {
    internal let stage: UniversalSearchStage
    @State private var path = NavigationPath()

    internal init(stage: UniversalSearchStage) {
        self.stage = stage
        var path = NavigationPath()
        if let opened = stage.opened { path.append(opened) }
        _path = State(initialValue: path)
    }

    internal var body: some View {
        NavigationStack(path: $path) {
            UniversalSearchScreen(stage: stage)
        }
    }
}

extension View {
    /// Registers where search rows open: a purchase always, because only
    /// search opens one, and Inventory's routes unless the stack search was
    /// pushed onto already has them.
    internal func searchDestinations(inventory registersInventory: Bool) -> some View {
        inventoryDestinations(registersInventory)
            .navigationDestination(for: SearchRoute.self) { route in
                switch route {
                case .purchase(let id): SearchPurchaseDestination(id: id)
                }
            }
    }
}

/// A purchase opened from search: the purchases detail, with the lines
/// search knows it holds.
private struct SearchPurchaseDestination: View {
    let id: String

    var body: some View {
        if let purchase = PurchasesSearchFixtures.purchase(id: id) {
            PurchaseDetailSurface(detail: detail(purchase))
        } else {
            EmptyStateView(message: "This purchase is no longer here.")
        }
    }

    private func detail(_ purchase: Purchase) -> PurchaseDetail {
        let sample = PurchaseDetailSurfaces.sample(for: purchase)
        let lines = PurchasesSearchFixtures.items
            .filter { $0.purchaseID == purchase.id }
            .map {
                PurchaseDetailLine(
                    id: $0.id, name: $0.name, quantity: $0.quantity, lineTotal: $0.lineTotal)
            }
        return PurchaseDetail(
            purchase: purchase, subtotal: sample.subtotal, tax: sample.tax,
            shipping: sample.shipping, discount: sample.discount, surcharge: sample.surcharge,
            source: sample.source, lines: lines, pages: sample.pages)
    }
}
