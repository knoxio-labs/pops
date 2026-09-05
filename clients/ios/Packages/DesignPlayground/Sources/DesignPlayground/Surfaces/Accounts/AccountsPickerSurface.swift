import AppCore
import DesignSystem
import FeatureAccounts
import SwiftUI

extension AccountsSurfaces {
    /// Picking an account for a transaction, over the transaction itself.
    ///
    /// No "searching" state here: the facsimile this replaces drove a
    /// `@FocusState` through a `focusSearch` flag it invented for the
    /// occasion, and the real `AccountPickerView` exposes no such hook — its
    /// search field is a plain `@State` private to the view. Reviewing search
    /// focused is not a state this surface can honestly stage without adding
    /// an API `FeatureAccounts` has no other reason to carry.
    @MainActor internal static var pickerSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "accounts", slug: "picker"),
            title: "Account picker",
            synopsis:
                "Choosing the account a transaction is filed against, over the transaction itself.",
            chrome: .sheet,
            states: [
                DesignState.standard {
                    AccountPickerView(
                        accounts: Fixtures.activeAccounts, selectedID: Fixtures.amex.id
                    ) { _ in }
                },
                DesignState("archived", "Archived revealed") {
                    AccountPickerView(
                        accounts: Fixtures.allAccounts, selectedID: Fixtures.amex.id
                    ) { _ in }
                },
                DesignState("empty", "No accounts") {
                    AccountPickerView(accounts: []) { _ in }
                },
            ],
            backdrop: { NewTransactionBackdrop() }
        )
    }
}

/// The transaction being filed, which is what the picker is presented over.
///
/// Not decoration: the sheet is the shape it is *because* this stays visible,
/// so a review that could not see it could not check the claim.
internal struct NewTransactionBackdrop: View {
    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("New transaction")
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsForeground)
                Text("−A$48.20")
                    .font(.popsAmount)
                    .foregroundStyle(Color.popsForeground)
            }
            PopsCard {
                VStack(spacing: PopsSpacing.zero) {
                    PopsRow(title: "Date") {
                        Text("3 Sep 2026").font(.popsBody)
                            .foregroundStyle(Color.popsForeground)
                    }
                    PopsDivider()
                    PopsRow(title: "Account") {
                        HStack(spacing: PopsSpacing.xs) {
                            Text("Amex").font(.popsBody)
                            Image(systemName: "chevron.right").font(.popsCaption)
                        }
                        .foregroundStyle(Color.popsAccent)
                    }
                    PopsDivider()
                    PopsRow(title: "Entity") {
                        Text("Woolworths").font(.popsBody)
                            .foregroundStyle(Color.popsForeground)
                    }
                }
            }
            Spacer()
        }
        .padding(PopsSpacing.lg)
    }
}
