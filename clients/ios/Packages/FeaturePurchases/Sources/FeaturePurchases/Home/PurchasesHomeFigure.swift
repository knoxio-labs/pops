import DesignSystem
import SwiftUI

internal struct PurchasesHomeFigure: View {
    internal let digest: PurchasesHomeDigest
    internal let refresh: PurchasesHomeRefresh
    internal let onRetry: () -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(spacing: PopsSpacing.sm) {
                if let month = digest.month {
                    Text(PurchasesPresentation.month(month).uppercased())
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
                PurchasesRefreshCapsule(refresh: refresh, onRetry: onRetry)
            }
            .frame(minHeight: PopsSize.touchTarget)
            if let headline = digest.totals.first {
                Text(headline.formatted())
                    .font(.popsAmount)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText(value: Double(headline.minorUnits)))
            }
            ForEach(digest.totals.dropFirst(), id: \.currencyCode) { total in
                Text("and \(total.formatted())")
                    .font(.popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: PopsSpacing.sm) {
                    deltaLine
                    count
                }
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    deltaLine
                    count
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.lg)
        .padding(.top, PopsSpacing.xs)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .topTrailing) { PurchaseHeroWash() }
        .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card))
        .popsGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }

    @ViewBuilder private var deltaLine: some View {
        if let delta = digest.delta, let line = PurchasesHomeCopy.deltaLine(delta) {
            Label {
                Text(line)
                    .contentTransition(.numericText(value: Double(delta.amount.minorUnits)))
            } icon: {
                Image(systemName: delta.isUp ? "arrow.up.right" : "arrow.down.right")
            }
            .font(.popsSubheadline.weight(.medium))
            .foregroundStyle(delta.isUp ? Color.popsWarning : Color.popsSuccess)
            .labelStyle(PurchasesTightLabelStyle())
        }
    }

    private var count: some View {
        Text(PurchasesHomeCopy.count(digest.monthCount, currencies: digest.totals.count))
            .font(.popsSubheadline)
            .foregroundStyle(Color.popsMutedForeground)
            .contentTransition(.numericText(value: Double(digest.monthCount)))
            .lineLimit(1)
    }
}

private struct PurchasesTightLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: PopsSpacing.xs) {
            configuration.icon
            configuration.title
        }
    }
}

internal struct PurchasesRefreshCapsule: View {
    internal let refresh: PurchasesHomeRefresh
    internal let onRetry: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @ViewBuilder internal var body: some View {
        switch refresh {
        case .current:
            EmptyView()
        case .refreshing:
            capsule(
                "Updating", symbol: "arrow.trianglehead.2.clockwise.rotate.90",
                tone: .popsPurchases, turning: true
            )
            .accessibilityLabel("Updating purchases")
            .transition(.opacity)
        case .failed(let updated):
            Button(action: onRetry) {
                capsule(
                    PurchasesHomeCopy.refreshFailure(updated),
                    symbol: "exclamationmark.arrow.trianglehead.2.clockwise.rotate.90",
                    tone: .popsWarning,
                    turning: false)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Not updated since \(updated). Try again.")
            .transition(.opacity)
        }
    }

    private func capsule(_ title: String, symbol: String, tone: Color, turning: Bool) -> some View {
        Label {
            Text(title)
        } icon: {
            Image(systemName: symbol)
                .symbolEffect(
                    .rotate, options: .repeat(.continuous), isActive: turning && !reduceMotion)
        }
        .font(.popsCaption.weight(.semibold))
        .foregroundStyle(tone)
        .padding(.horizontal, PopsSpacing.md)
        .padding(.vertical, PopsSpacing.sm)
        .background(Color.popsSurface, in: .capsule)
        .overlay(Capsule().stroke(tone, lineWidth: PopsBorder.hairline))
        .lineLimit(1)
    }
}
