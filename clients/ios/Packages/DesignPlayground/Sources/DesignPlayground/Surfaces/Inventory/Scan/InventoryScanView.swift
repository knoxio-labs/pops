import DesignSystem
import SwiftUI

/// The general POPS QR scanner, opened from the Inventory tab's scan
/// control. Its camera is a stand-in rectangle rather than `AVFoundation`,
/// same as every other surface here, what is being reviewed is the
/// reticle, the permission copy and the outcome banner, not the capture
/// pipeline.
internal struct InventoryScanView: View {
    internal var access: InventoryScanAccess = .authorized
    internal var outcome: InventoryScanOutcome?

    internal var body: some View {
        ZStack {
            Color.popsBackground.ignoresSafeArea()
            switch access {
            case .authorized, .undetermined:
                reticleContent
            case .denied, .restricted, .unavailable:
                InventoryScanPermissionExplanation(access: access)
            }
        }
        .navigationTitle("Scan")
        .playgroundTitleDisplay(large: false)
    }

    private var reticleContent: some View {
        VStack(spacing: PopsSpacing.lg) {
            Spacer(minLength: PopsSpacing.zero)
            InventoryScanReticle()
            Text("Line up an item, container or location label")
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
            if let outcome {
                InventoryScanOutcomeBanner(outcome: outcome)
            }
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(PopsSpacing.lg)
    }
}

/// The frame a reader lines a label up inside. Amber, Inventory's own
/// colour, so the reticle reads as this pillar's even before anything is
/// found.
internal struct InventoryScanReticle: View {
    internal var body: some View {
        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
            .strokeBorder(Color.popsInventory, lineWidth: PopsBorder.emphasis)
            .aspectRatio(1, contentMode: .fit)
            .padding(.horizontal, PopsSpacing.xxl)
            .accessibilityHidden(true)
    }
}

/// What the reader sees instead of the camera, and what would fix it.
internal struct InventoryScanPermissionExplanation: View {
    internal let access: InventoryScanAccess

    internal var body: some View {
        InventoryStateNotice(kind: .permission)
            .overlay(alignment: .bottom) {
                if access == .unavailable || access == .restricted {
                    Text(caption)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .padding(.bottom, PopsSpacing.lg)
                }
            }
    }

    private var caption: String {
        access == .unavailable
            ? "This device has no camera. Find items by name instead."
            : "A restriction on this phone keeps every app from the camera."
    }
}

/// What a scan came back with, shown over the reticle rather than replacing
/// it, the next attempt is one label-width away.
internal struct InventoryScanOutcomeBanner: View {
    internal let outcome: InventoryScanOutcome

    internal var body: some View {
        Text(outcome.bannerMessage)
            .font(.popsSubheadline.weight(.semibold))
            .foregroundStyle(Color.popsForeground)
            .padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            .playgroundGlass(
                in: RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous))
    }
}
