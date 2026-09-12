import DesignSystem
import SwiftUI

/// A menu dressed as a field.
///
/// A picked value and a typed one have to sit at the same weight in the same
/// column, or the form stops reading like the paper it is being checked
/// against — which is the one thing this whole surface is for.
///
/// A view rather than a method on the form for two reasons: six arguments is
/// past what a function should take, and a `View`'s own memberwise
/// initialiser is not a function at all, so the names stay at the call site
/// where they explain themselves.
internal struct ReceiptDraftPicker<Items: View>: View {
    internal let label: String
    internal let value: String
    internal let placeholder: String
    internal let font: Font
    /// Whether ``value`` came from the list. A typed value shows as the
    /// placeholder here and in the field below, because a menu displaying
    /// something it cannot offer is a menu lying about its contents.
    internal let resolved: Bool
    @ViewBuilder internal let items: Items

    /// A menu dressed as a field, so a picked value and a typed one sit at the
    /// same weight in the same column and the form still reads like the paper.
    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Menu {
                items
            } label: {
                HStack(spacing: PopsSpacing.sm) {
                    Text(resolved && !value.isEmpty ? value : placeholder)
                        .font(font)
                        .foregroundStyle(
                            resolved && !value.isEmpty
                                ? Color.popsForeground : Color.popsMutedForeground
                        )
                        .lineLimit(1)
                    Spacer(minLength: PopsSpacing.sm)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            PopsDivider()
        }
    }
}
