import AppCore
import DesignSystem
import FeaturePairing
import SwiftUI

/// The Purchases tab's first screen: the month's figure, the two ways into
/// the archive, and Recent or Where it went under one segmented control, with
/// the capture control at the foot as Inventory's dashboard places Scan.
///
/// It fits a phone without scrolling at the default text size. The decided
/// digest stacked four bands and scrolled; Recent and Where it went are both
/// short ranked lists answering "what", so they share one panel and a
/// segmented control rather than a second screenful.
internal struct PurchasesHomeView: View {
    @State internal var phase: PurchasesHomePhase
    @State internal var list: PurchasesHomeList = .recent
    @State internal var highlighted: String?
    @State internal var capturing: PurchaseCaptureSource?
    @State internal var pairing = false
    @Environment(\.dynamicTypeSize) internal var dynamicTypeSize
    /// A purchase to land a moment after the screen opens, as a finished
    /// capture's save does.
    private let arriving: Purchase?

    private let captureDiameter: CGFloat = 60

    internal init(
        phase: PurchasesHomePhase,
        list: PurchasesHomeList = .recent,
        arriving: Purchase? = nil
    ) {
        _phase = State(initialValue: phase)
        _list = State(initialValue: list)
        self.arriving = arriving
    }

    internal var body: some View {
        Group {
            switch phase {
            case .loading:
                PurchasesHomeSkeleton()
                    .transition(.opacity)
            case .failed(let failure):
                PurchasesHomeFailureView(failure: failure) { action in
                    act(on: action)
                }
                .transition(.opacity)
            case .loaded(let purchases, let refresh):
                if purchases.isEmpty {
                    PurchasesHomeEmptyView { capturing = .scan }
                        .transition(.opacity)
                } else {
                    content(PurchasesHomeDigest(purchases), refresh: refresh)
                        .transition(.opacity)
                }
            }
        }
        .inventoryMotion(InventoryMotion.smooth, value: phase)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom, alignment: .trailing) {
            if case .loaded = phase {
                captureControl
            }
        }
        .sheet(item: $capturing) { source in
            PurchaseCaptureSheet(source: source)
        }
        .sheet(isPresented: $pairing) {
            PairingView(model: PairingSurfaceFactory.model())
        }
        .task { await land() }
    }

    private func content(_ digest: PurchasesHomeDigest, refresh: PurchasesHomeRefresh)
        -> some View
    {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                PurchasesHomeFigure(digest: digest, refresh: refresh) { retryRefresh() }
                tiles(digest)
                lists(digest)
            }
            .inventoryMotion(value: digest.purchases.map(\.id))
            .inventoryMotion(value: list)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.lg)
        }
        .scrollBounceBehavior(.basedOnSize)
        .refreshable { await runRefresh() }
    }
}

extension PurchasesHomeView {
    /// The capture control: Inventory's Scan circle, carrying this family's
    /// tint, opening the four ways a purchase comes in.
    ///
    /// A `Menu` rather than a confirmation dialog because an action sheet's
    /// entries cannot carry a glyph, and a `Menu` is what the system reaches
    /// for when one control offers several ways to do one thing. The two
    /// pickers are separate entries because the system's own pickers are.
    private var captureControl: some View {
        Menu {
            ForEach(PurchaseCaptureSource.allCases) { source in
                Button(source.title, systemImage: source.symbol) { capturing = source }
            }
        } label: {
            Image(systemName: "plus")
                .font(.popsTitle)
                .foregroundStyle(Color.popsPurchases)
                .frame(width: captureDiameter, height: captureDiameter)
        }
        .playgroundGlass(in: Circle())
        .padding(.trailing, PopsSpacing.xl)
        .padding(.bottom, PopsSpacing.lg)
        .accessibilityLabel("Add a purchase")
    }

    private func act(on action: PurchasesHomeFailureAction) {
        switch action {
        case .retry:
            Task { await reload() }
        case .pair:
            pairing = true
        }
    }

    private func reload() async {
        phase = .loading
        try? await Task.sleep(for: PurchasesHomeTiming.answer)
        phase = .loaded(PurchasesFixtures.history)
    }

    private func runRefresh() async {
        guard case .loaded(let purchases, _) = phase else { return }
        phase = .loaded(purchases, refresh: .refreshing)
        try? await Task.sleep(for: PurchasesHomeTiming.answer)
        phase = .loaded(purchases, refresh: .current)
    }

    private func retryRefresh() {
        Task { await runRefresh() }
    }

    /// Lands the arriving purchase where its date puts it, marked, rather
    /// than announcing it in a toast that then takes the news away.
    private func land() async {
        guard let arriving, case .loaded(let purchases, let refresh) = phase else { return }
        try? await Task.sleep(for: InventoryMotion.stagedBeat)
        let placed = PurchasesHomeDigest.landing(arriving, in: purchases)
        highlighted = arriving.id
        phase = .loaded(placed, refresh: refresh)
    }
}

/// The two short lists the home's one panel switches between.
internal enum PurchasesHomeList: String, CaseIterable, Identifiable {
    case recent
    case leaders

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .recent: "Recent"
        case .leaders: "Where it went"
        }
    }
}

internal enum PurchasesHomeTiming {
    /// How long a staged read takes to answer, long enough for its skeleton
    /// or its updating capsule to be seen.
    internal static let answer = Duration.milliseconds(1_400)
}

/// The four ways a purchase comes in, as the capture control's menu offers
/// them.
internal enum PurchaseCaptureSource: String, CaseIterable, Identifiable {
    case scan
    case photos
    case file
    case hand

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .scan: "Scan a receipt"
        case .photos: "Choose photos"
        case .file: "Choose a file"
        case .hand: "Enter it by hand"
        }
    }

    internal var symbol: String {
        switch self {
        case .scan: "doc.viewfinder"
        case .photos: "photo.on.rectangle"
        case .file: "folder"
        case .hand: "square.and.pencil"
        }
    }
}
