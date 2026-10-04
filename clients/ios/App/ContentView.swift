import AppCore
import DesignSystem
import FeatureAccounts
import FeatureEgo
import FeatureInventory
import FeaturePurchases
import FeatureTransactions
import SwiftUI

/// The paired app: whatever the BFM said is reachable, and an honest sentence
/// when that is nothing.
///
/// The mapping from a feature id to a screen is here and only here. A feature
/// module names the id it draws; this decides what "drawing" it means, which is
/// what stops one feature from having to construct another's views.
///
/// Between features, this draws exactly one piece of navigation chrome — a tab
/// bar — and only once there is more than one tab feature to move between. Ego's
/// separate sheet entry stays available without becoming a tab. It draws none
/// inside a feature: a feature that has more than one screen brings
/// its own `NavigationStack` — `TransactionsFlowView` is the first — because
/// the routes between those screens belong to that feature and resolving them
/// here would mean this file naming every screen in the app. A stack around a
/// stack is also simply broken: the inner one wins and the outer one silently
/// does nothing.
internal struct ContentView: View {
    internal let surface: FeatureSurface
    internal let shell: AppShellModel
    internal let composition: AppComposition
    internal var purchasesCaptureObserver: (@MainActor (Bool) -> Void)?

    /// The tab the person chose, if they chose one. See ``features`` for why
    /// this is held here rather than left to `TabView`.
    @State private var chosenFeature: MobileFeature?
    @State private var egoPresented = false

    /// Which bootstrap failure, if any, a person has already dismissed the
    /// degraded banner for. See ``DegradedBannerVisibility``.
    @State private var bannerVisibility = DegradedBannerVisibility()

    /// The one search model behind ``searchTab``, asking every pillar
    /// `surface.available` allows. Held rather than built where it is used —
    /// same reasoning as ``AppComposition/router(for:)`` — so a query and its
    /// answer survive the tab being switched away from and back.
    @State private var searchModel: AppSearchModel<InventorySearchProvider, PurchasesSearchProvider>

    /// Builds the search model from the same dependencies ``screen(for:)``
    /// reads, over the pillars available at construction time; ``features``
    /// keeps it current as `surface.available` changes.
    internal init(
        surface: FeatureSurface,
        shell: AppShellModel,
        composition: AppComposition,
        purchasesCaptureObserver: (@MainActor (Bool) -> Void)? = nil
    ) {
        self.surface = surface
        self.shell = shell
        self.composition = composition
        self.purchasesCaptureObserver = purchasesCaptureObserver
        let dependencies: AppDependencies
        if case .paired(let device) = shell.session.state {
            dependencies = composition.dependencies(for: device)
        } else {
            dependencies = composition.pairingDependencies
        }
        _searchModel = State(
            wrappedValue: composition.searchModel(
                for: dependencies, available: Set(surface.available)))
    }

    internal var body: some View {
        features
            .safeAreaInset(edge: .bottom, spacing: PopsSpacing.zero) {
                EgoEntryView(
                    isAvailable: Self.showsEgoEntry(available: surface.available)
                        && !showsTabSwitcher,
                    placement: .safeArea,
                    onOpen: { egoPresented = true }
                )
            }
            .safeAreaInset(edge: .top) { degradedBanner }
            .modifier(
                EntitySheets(
                    presentation: composition.entityPresentation,
                    dependencies: dependencies,
                    entityRouter: composition.entityRouter,
                    isActive: !egoPresented
                )
            )
            .sheet(isPresented: $egoPresented) {
                EgoSheetView(
                    dependencies: dependencies,
                    context: { composition.egoScreenContext.current },
                    presentation: composition.entityPresentation,
                    entityRouter: composition.entityRouter,
                    onClose: { egoPresented = false }
                )
            }
            .environment(
                \.startRePairing,
                RePairingAction { composition.session.send(.revoked(.credentialsRejected)) }
            )
            .environment(\.inventoryStorageFullOnEntry, composition.inventoryStorageFull)
            .onChange(of: surface.available) {
                let available = surface.available
                let pillars = SearchPillar.allCases.filter { available.contains($0.feature) }
                searchModel.update(available: pillars)
            }
            .onChange(of: surface.bootstrap) { _, phase in
                if !phase.isDegraded { bannerVisibility.reset() }
            }
            .onChange(of: displayedTab, initial: true) { _, tab in
                composition.egoScreenContext.selectedTab = tab
            }
            .onChange(
                of: composition.entityPresentation.presentedObjectURI, initial: true
            ) { _, uri in
                composition.egoScreenContext.presentedObjectURI = uri
            }
    }

    /// Identifies the app-wide search tab in the switcher below. Not a
    /// `MobileFeature` the BFM ever sends — this is a sibling the shell adds
    /// whenever any searchable pillar is available, not a feature of its own
    /// — but the same hashable type as `.tag(feature)` uses, so the two
    /// coexist in one `TabView` without a second tag type to reconcile.
    nonisolated internal static let searchTab = MobileFeature(rawValue: "search")

    /// Whether any pillar universal search covers is among the BFM's
    /// available features, and so whether the search tab — the approved
    /// shell's one app-wide search, always present alongside whatever it can
    /// search — belongs in the switcher.
    private var hasSearch: Bool {
        SearchPillar.allCases.contains { surface.available.contains($0.feature) }
    }

    private var showsTabSwitcher: Bool {
        let count = Self.tabFeatures(for: surface.available).count
        return count > 1 || hasSearch
    }

    /// Tab features, More, and the app-wide search tab. Ego is exposed by
    /// its sheet entry and does not count when choosing a tab layout.
    ///
    /// Zero gets the explanation below. Exactly one fills the screen outright
    /// — the shipped single-feature look, unchanged, because a tab bar with
    /// one tab is chrome nobody asked for — unless that one feature is
    /// searchable, whose search sibling makes it two. Two or more (with or
    /// without that sibling) get a `TabView`, grouping secondary features under More.
    ///
    /// The `TabView` is given its selection rather than left to track one on
    /// its own. Left alone, it dropped back to the first tab whenever a tab's
    /// root view changed type: on the Purchases tab, "Add a purchase" swaps
    /// the prompt for the hand-entry form, and the app landed on Transactions
    /// instead of the form. Nothing above this view was rebuilt when it
    /// happened; the implicit selection was simply lost.
    /// `purchases-hand-entry.yaml` is the flow that catches it.
    @ViewBuilder internal var features: some View {
        let tabFeatures = Self.tabFeatures(for: surface.available)
        switch (tabFeatures.count, hasSearch) {
        case (0, _):
            unavailableExplanation
        case (1, false):
            screen(for: tabFeatures[0])
        default:
            TabView(selection: selection) {
                ForEach(Self.primaryFeatures(for: surface.available), id: \.self) { feature in
                    Tab(
                        RootCopy.name(of: feature), systemImage: RootCopy.symbol(for: feature),
                        value: feature
                    ) {
                        screen(for: feature)
                    }
                }
                if !Self.moreFeatures(for: surface.available).isEmpty {
                    Tab(RootCopy.more, systemImage: "ellipsis", value: Self.moreTab) {
                        MoreFeaturesView(
                            features: Self.moreFeatures(for: surface.available),
                            onSelectionChange: {
                                composition.egoScreenContext.moreSelection = $0
                            },
                            destination: { feature in screen(for: feature) }
                        )
                    }
                    .accessibilityIdentifier(Self.moreTabAccessibilityIdentifier)
                }
                if hasSearch {
                    Tab(value: Self.searchTab, role: .search) {
                        AppSearchTab(
                            model: searchModel, dependencies: dependencies,
                            entityRouter: composition.entityRouter)
                    }
                }
            }
            .tint(Self.tabTint(for: selection.wrappedValue))
            .tabViewBottomAccessory(
                isEnabled: Self.showsEgoEntry(available: surface.available)
            ) {
                EgoEntryView(
                    isAvailable: Self.showsEgoEntry(available: surface.available),
                    placement: .tabAccessory,
                    onOpen: { egoPresented = true }
                )
            }
        }
    }

    /// The tab bar's tint for the tab showing: each feature tint while its tab
    /// is selected, and the platform's own tint where no feature tint applies.
    ///
    /// A tab bar tints the selected item and nothing else, so tinting the
    /// whole `TabView` from the selection is what makes a colour belong to its
    /// feature rather than to whichever tab happens to be chosen. The search
    /// tab is a tab of its own and keeps the usual tint.
    ///
    /// `nonisolated` because it is pure, for the reason ``shownFeature`` is.
    nonisolated internal static func tabTint(for shown: MobileFeature) -> Color? {
        switch shown {
        case FeaturePurchases.feature:
            .popsPurchases
        case FeatureInventory.feature:
            .popsInventory
        default:
            nil
        }
    }

    private var selection: Binding<MobileFeature> {
        Binding(
            get: {
                Self.shownFeature(
                    chosen: chosenFeature,
                    available: Self.tabs(
                        for: Self.tabFeatures(for: surface.available)
                    )
                )
            },
            set: { chosenFeature = $0 }
        )
    }

    /// Which tab shows: the one chosen, while the BFM still offers it, and
    /// otherwise the first — so a reload that drops the chosen feature lands
    /// somewhere real instead of on a tab that no longer exists. Only asked
    /// with two or more features available, which is when there are tabs.
    /// `nonisolated` because it is pure: a `View` puts its members on the main
    /// actor, which this rule has no need of.
    nonisolated internal static func shownFeature(
        chosen: MobileFeature?, available: [MobileFeature]
    ) -> MobileFeature {
        if let chosen, available.contains(chosen) { return chosen }
        return available[0]
    }

    /// Non-blocking, above the content, and never in the way of it. The app is
    /// usable; this says the picture it is working from is incomplete.
    ///
    /// Attached to `features` with `.safeAreaInset(edge: .top)` rather than
    /// stacked above it: a stack takes the banner's height off the top of
    /// the whole tree, which for the multi-feature case is the `TabView`
    /// itself — so the tab bar at its bottom shifts up by that height too,
    /// moving a control a person navigates by muscle memory. A safe-area
    /// inset instead reserves space inside `features`' own layout, the same
    /// reasoning `PopsActionBar`'s docstring gives for the equivalent bottom
    /// case.
    ///
    /// Dismissable, because a Watchtower blip that heals itself in a few
    /// seconds (POPS-3731) used to leave this on screen, unshiftable, for the
    /// rest of a foregrounded session — nothing re-polls on a timer, by
    /// design, so a person who has seen the notice and wants their screen
    /// back had no way to ask for it. Dismissing only silences *this* phase;
    /// ``DegradedBannerVisibility`` shows it again for whatever comes next.
    @ViewBuilder private var degradedBanner: some View {
        if bannerVisibility.isVisible(for: surface.bootstrap) {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        Text(RootCopy.degraded)
                            .font(.popsBody)
                            .foregroundStyle(Color.popsMutedForeground)
                        Spacer(minLength: PopsSpacing.sm)
                        Button {
                            bannerVisibility.dismiss(surface.bootstrap)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.popsBody)
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                        .accessibilityLabel(RootCopy.dismissDegraded)
                    }
                }
            }
            .padding([.horizontal, .top], PopsSpacing.lg)
        }
    }

    /// Built from the session rather than held, because the client behind it is
    /// per device — see ``AppComposition``.
    internal var dependencies: AppDependencies {
        guard case .paired(let device) = shell.session.state else {
            return composition.pairingDependencies
        }
        return composition.dependencies(for: device)
    }
}

extension ContentView {
    /// The feature actually on screen, including the single-feature layout
    /// which has no tab control and the synthetic More and search tabs.
    fileprivate var displayedTab: MobileFeature? {
        guard !surface.available.isEmpty else { return nil }
        if surface.available.count == 1, !hasSearch { return surface.available[0] }
        return Self.shownFeature(
            chosen: chosenFeature, available: Self.tabs(for: surface.available))
    }
}
