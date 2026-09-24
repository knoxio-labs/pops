import DesignSystem
import SwiftUI

/// The Sync page before its ledger arrives.
internal struct InventorySyncSkeleton: View {
    @ScaledMetric(relativeTo: .subheadline) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var tileHeight = PopsSize.touchTarget * 1.6
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    Capsule().fill(Color.popsSurface)
                        .frame(width: line * 8, height: line)
                    RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                        .fill(Color.popsSurface)
                        .frame(height: tileHeight)
                }
                .popsShimmer()
                VStack(spacing: PopsSpacing.md) {
                    ForEach(0..<6, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                            .fill(Color.popsSurface)
                            .frame(height: rowHeight)
                    }
                }
                .popsShimmer()
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .accessibilityLabel("Loading")
    }
}

/// Nothing has been downloaded to this phone yet. Pairing and opening this
/// tab both ask for a sync on their own, so reaching this screen means that
/// has not finished — offline at the time, most often — rather than nobody
/// having asked; the button retries it by hand.
internal struct InventorySyncFirstLaunch: View {
    internal let onDownload: () -> Void

    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            Spacer(minLength: PopsSpacing.zero)
            Text("Not synced yet")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
            Button(action: onDownload) {
                Label("Download", systemImage: "arrow.down.circle.fill")
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .buttonStyle(.borderedProminent)
            .tint(.popsInventory)
            .padding(.horizontal, PopsSpacing.xxl)
            Spacer(minLength: PopsSpacing.zero)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(PopsSpacing.lg)
        .background(Color.popsBackground)
    }
}

/// The first synchronization, as a fraction of the snapshot stored so far.
internal struct InventorySyncDownloading: View {
    internal let progress: Double

    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            Spacer(minLength: PopsSpacing.zero)
            ProgressView(value: progress)
                .tint(.popsInventory)
                .frame(maxWidth: PopsSize.touchTarget * 4)
            Text("Synchronizing \(progress.formatted(.percent.precision(.fractionLength(0))))")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
                .contentTransition(.numericText(value: progress))
            Spacer(minLength: PopsSpacing.zero)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(PopsSpacing.lg)
        .background(Color.popsBackground)
        .accessibilityElement(children: .combine)
    }
}
