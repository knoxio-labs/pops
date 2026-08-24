import AppCore
import DesignSystem
import SwiftUI

/// The purchase history, with states that distinguish an empty history from an unavailable one.
public struct PurchasesListView: View {
    @State private var model: PurchasesListViewModel

    public init(dependencies: AppDependencies) {
        _model = State(wrappedValue: PurchasesListViewModel(dependencies: dependencies))
    }

    public var body: some View {
        Group {
            if model.isLoading {
                LoadingStateView(message: "Loading purchases…")
            } else if let failure = model.failure {
                ErrorStateView(message: message(for: failure), retryTitle: "Retry") {
                    Task { await model.load(force: true) }
                }
            } else if model.purchases.isEmpty {
                EmptyStateView(message: "No purchases yet.")
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
                        ForEach(model.purchases) { purchase in
                            PurchasesRow(purchase: purchase)
                        }
                    }
                    .padding(PopsSpacing.lg)
                }
                .refreshable { await model.load(force: true) }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .task { await model.load() }
        .accessibilityIdentifier("purchases-list")
    }

    private func message(for error: RepositoryError) -> String {
        switch error {
        case .unavailable:
            "Your purchases are temporarily unreachable. Try again in a moment."
        case .unauthorized:
            "This device is no longer signed in."
        case .contractMismatch:
            "This version of Pops cannot read what the server sent. Update the app."
        case .transport:
            "Could not reach the server. Check your connection and try again."
        case .dependencyNotBound:
            "Pops is not set up correctly on this device."
        }
    }
}

private struct PurchasesRow: View {
    let purchase: Purchase

    var body: some View {
        PopsRow(
            title: purchase.merchantName ?? "Unknown merchant",
            subtitle: purchase.orderedOn.formatted(date: .abbreviated, time: .omitted)
        ) {
            Text(purchase.total.formatted())
                .font(.popsMonospaced)
                .foregroundStyle(Color.popsForeground)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(purchase.merchantName ?? "Unknown merchant"), \(purchase.total.formatted())"
        )
    }
}
