import DesignSystem
import SwiftUI

internal struct PurchasesCaptureControls: View {
    internal let presenter: PurchaseCapturePresenter
    private let diameter = PopsSize.touchTarget + PopsSpacing.lg

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Menu {
                ForEach(PurchaseCaptureSource.added) { source in
                    Button(source.title, systemImage: source.symbol) { presenter(source) }
                }
            } label: {
                Image(systemName: "plus")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                    .frame(width: diameter, height: diameter)
            }
            .popsGlass(in: Circle())
            .accessibilityLabel("Add a purchase")
            .accessibilityIdentifier(PurchasesAccessibility.add)

            Button {
                presenter(.scan)
            } label: {
                Image(systemName: PurchaseCaptureSource.scan.symbol)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsPurchases)
                    .frame(width: diameter, height: diameter)
            }
            .buttonStyle(.plain)
            .popsGlass(in: Circle())
            .accessibilityLabel(PurchaseCaptureSource.scan.title)
            .accessibilityIdentifier(PurchasesAccessibility.scan)
        }
        .padding(.trailing, PopsSpacing.xl)
        .padding(.bottom, PopsSpacing.lg)
    }
}
