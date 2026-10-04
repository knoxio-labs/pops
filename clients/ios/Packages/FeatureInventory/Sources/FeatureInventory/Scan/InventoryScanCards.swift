import AppCore
import DesignSystem
import SwiftUI

extension View {
    /// The glass card every answer under the reticle sits in.
    internal func inventoryScanCard() -> some View {
        let shape = RoundedRectangle(cornerRadius: PopsRadius.card * 2, style: .continuous)
        return
            padding(PopsSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsBackground.opacity(0.6), in: shape)
            .popsGlass(in: shape)
    }
}

/// The skeleton while a code's lookup is in flight.
internal struct InventoryScanLoadingCard: View {
    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            RoundedRectangle(cornerRadius: PopsRadius.control)
                .fill(Color.popsSurface)
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            RoundedRectangle(cornerRadius: PopsRadius.control)
                .fill(Color.popsSurface)
                .frame(height: PopsSize.touchTarget * 0.4)
        }
        .popsShimmer()
        .inventoryScanCard()
    }
}

/// Every item carrying a scanned barcode, one `row` each. The rows scroll
/// only once there are more than fit under the reticle.
internal struct InventoryScanMatchesCard<Row: View>: View {
    internal let records: [InventoryRecord]
    @ViewBuilder internal let row: (InventoryRecord) -> Row

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(InventoryCopy.itemsHaveThisCode(records.count))
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            ViewThatFits(in: .vertical) {
                rows
                ScrollView { rows }.scrollBounceBehavior(.basedOnSize, axes: .vertical)
            }
            .frame(maxHeight: PopsSize.touchTarget * 5)
        }
        .inventoryScanCard()
    }

    private var rows: some View {
        VStack(spacing: PopsSpacing.zero) {
            ForEach(records) { record in
                row(record)
                if record.id != records.last?.id {
                    PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                }
            }
        }
    }
}

/// A one-line answer with no action to take: a hand-off, a bad code, or a
/// code with nothing behind it.
internal struct InventoryScanLineCard: View {
    internal let symbol: String
    internal let text: String

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
            Text(text)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: PopsSpacing.sm)
        }
        .frame(minHeight: PopsSize.touchTarget)
        .inventoryScanCard()
    }
}

/// What a scanner shows in place of the camera once access is refused: one
/// line, and the way to Settings.
internal struct InventoryScanDenied: View {
    @Environment(\.openURL) private var openURL

    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            Text(InventoryCopy.cameraAccessOff)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .multilineTextAlignment(.center)
            if let settings = SystemSettings.url {
                Button("Settings") { openURL(settings) }
                    .popsProminentGlassButton()
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
    }
}
