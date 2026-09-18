import DesignSystem
import SwiftUI

/// The shared POPS scanner: the camera full-bleed, glass controls over it, a
/// reticle, and a card that rises with whatever the code resolved to.
///
/// The camera is a still photograph standing in for the feed; what is being
/// reviewed is the chrome over it, not the capture pipeline.
internal struct InventoryScanView: View {
    internal var phase: InventoryScanPhase = .scanning
    @Environment(\.dismiss) private var dismiss
    @State private var torchOn = false
    @State private var shown = false

    private static let feed = SamplePhoto.data("moving-box")

    internal var body: some View {
        ZStack {
            if phase == .denied {
                Color.popsBackground.ignoresSafeArea()
                denied
            } else {
                viewfinder
                VStack(spacing: PopsSpacing.xl) {
                    InventoryScanReticle(found: isFound)
                    if shown, let card {
                        card
                            .padding(.horizontal, PopsSpacing.lg)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
        }
        .safeAreaInset(edge: .top) { controls }
        .inventoryMotion(InventoryMotion.smooth, value: shown)
        .onAppear { shown = true }
        .tint(.popsInventory)
    }

    private var isFound: Bool {
        if case .found = phase { return true }
        return false
    }

    private var viewfinder: some View {
        Color.popsBackground
            .overlay {
                InventoryItemDetailPicture(
                    photo: InventoryPhoto(caption: "", isBroken: false, imageData: Self.feed),
                    symbol: InventorySymbol.camera.system)
            }
            .overlay { Color.popsBackground.opacity(0.45) }
            .clipped()
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }

    private var controls: some View {
        PlaygroundGlassGroup(spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                InventoryScanControl(symbol: "xmark", label: "Close") { dismiss() }
                Spacer(minLength: PopsSpacing.sm)
                if phase != .denied {
                    InventoryScanControl(
                        symbol: torchOn ? "flashlight.on.fill" : InventorySymbol.torch.system,
                        label: "Torch", isOn: torchOn
                    ) { torchOn.toggle() }
                    InventoryScanControl(
                        symbol: InventorySymbol.library.system, label: "Photo library"
                    ) {}
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
    }

    private var denied: some View {
        VStack(spacing: PopsSpacing.lg) {
            InventoryCentredLine(text: "Camera access is off")
            Button("Settings") {}
                .playgroundProminentGlassButton()
        }
        .padding(.horizontal, PopsSpacing.lg)
    }

    private var card: InventoryScanCard? {
        switch phase {
        case .scanning, .denied: nil
        case .loading: .loading
        case .found(let target): .found(target)
        case .unsupported(let pillar):
            .line(InventorySymbol.appUpdate.system, "Opens in \(pillar)", "Open")
        case .notPops: .line(InventorySymbol.unavailable.system, "Not a POPS code", nil)
        case .targetMissing: .line(InventorySymbol.lost.system, "No longer in Inventory", nil)
        }
    }
}

/// The card under the reticle.
internal enum InventoryScanCard: View {
    case loading
    case found(InventoryScanTarget)
    case line(String, String, String?)

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.card * 2, style: .continuous)
    }

    internal var body: some View {
        content
            .padding(PopsSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsBackground.opacity(0.6), in: shape)
            .playgroundGlass(in: shape)
    }

    @ViewBuilder private var content: some View {
        switch self {
        case .loading:
            InventoryLocationListSkeleton(rows: 1)
        case .found(let target):
            HStack(spacing: PopsSpacing.sm) {
                row(target)
                Button("Open") {}
                    .playgroundProminentGlassButton()
            }
        case .line(let symbol, let text, let action):
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsMutedForeground)
                Text(text)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: PopsSpacing.sm)
                if let action {
                    Button(action) {}
                        .playgroundProminentGlassButton()
                }
            }
            .frame(minHeight: PopsSize.touchTarget)
        }
    }

    @ViewBuilder private func row(_ target: InventoryScanTarget) -> some View {
        switch target {
        case .record(let record):
            InventoryRecordRowLabel(record: record, showsChevron: false)
        case .place(let place):
            InventoryPlaceRowLabel(
                place: place, tree: InventorySearchFixtures.places, showsChevron: false)
        }
    }
}

/// One round glass control over the camera.
internal struct InventoryScanControl: View {
    internal let symbol: String
    internal let label: String
    internal var isOn = false
    internal let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    internal var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.popsBody.weight(.semibold))
                .foregroundStyle(isOn ? Color.popsBackground : Color.popsInventory)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: size, height: size)
                .background {
                    if isOn { Circle().fill(Color.popsInventory) }
                }
                .playgroundGlass(in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// Four amber corners a label is lined up inside; they close in a little once
/// something is found.
internal struct InventoryScanReticle: View {
    internal let found: Bool

    internal var body: some View {
        InventoryReticleCorners()
            .stroke(
                Color.popsInventory,
                style: StrokeStyle(lineWidth: PopsBorder.emphasis * 2, lineCap: .round)
            )
            .aspectRatio(1, contentMode: .fit)
            .containerRelativeFrame(.horizontal) { width, _ in width * 0.62 }
            .scaleEffect(found ? 0.92 : 1)
            .inventoryMotion(InventoryMotion.smooth, value: found)
            .accessibilityHidden(true)
    }
}

private struct InventoryReticleCorners: Shape {
    func path(in rect: CGRect) -> Path {
        let arm = rect.width * 0.18
        var path = Path()
        for corner in 0..<4 {
            let isLeading = corner % 2 == 0
            let isTop = corner < 2
            let tip = CGPoint(
                x: isLeading ? rect.minX : rect.maxX, y: isTop ? rect.minY : rect.maxY)
            let dx = isLeading ? arm : -arm
            let dy = isTop ? arm : -arm
            path.move(to: CGPoint(x: tip.x + dx, y: tip.y))
            path.addLine(to: tip)
            path.addLine(to: CGPoint(x: tip.x, y: tip.y + dy))
        }
        return path
    }
}
