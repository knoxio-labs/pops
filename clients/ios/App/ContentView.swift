import AppCore
import DesignSystem
import FeatureAccounts
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
/// bar — and only once there is more than one feature to move between. It
/// draws none inside a feature: a feature that has more than one screen brings
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
        let providers = composition.searchProviders(for: dependencies)
        _searchModel = State(
            wrappedValue: AppSearchModel(
                tabOrder: SearchPillar.allCases.filter { surface.available.contains($0.feature) },
                inventoryProvider: providers.inventory,
                purchasesProvider: providers.purchases))
    }

    internal var body: some View {
        @Bindable var presentation = composition.entityPresentation
        features
            .safeAreaInset(edge: .top) { degradedBanner }
            .sheet(item: $presentation.inventory) { entity in
                InventoryEntityView(
                    entity: entity, dependencies: dependencies,
                    entityRouter: composition.entityRouter)
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

    /// Primary features, More, and the app-wide search tab.
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
    @ViewBuilder private var features: some View {
        switch (surface.available.count, hasSearch) {
        case (0, _):
            unavailableExplanation
        case (1, false):
            screen(for: surface.available[0])
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
                            features: Self.moreFeatures(for: surface.available)
                        ) { feature in
                            screen(for: feature)
                        }
                    }
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
                    chosen: chosenFeature, available: Self.tabs(for: surface.available))
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

    /// A feature is asked for its whole flow, not for one of its screens. What
    /// the routes inside it mean is the feature's own business — this only
    /// decides which feature is on screen.
    @ViewBuilder private func screen(for feature: MobileFeature) -> some View {
        switch feature {
        case FeatureTransactions.feature:
            TransactionsFlowView(
                dependencies: dependencies,
                router: composition.router(for: FeatureTransactions.feature))
        case FeatureAccounts.feature:
            AccountsFlowView(
                dependencies: dependencies,
                router: composition.router(for: FeatureAccounts.feature))
        case FeaturePurchases.feature:
            if let purchasesCaptureObserver {
                PurchasesFlowView(
                    dependencies: dependencies,
                    captureAvailable: surface.captureAvailable,
                    captureObserver: purchasesCaptureObserver)
            } else {
                PurchasesFlowView(
                    dependencies: dependencies,
                    captureAvailable: surface.captureAvailable)
            }
        case FeatureInventory.feature:
            InventoryFlowView(dependencies: dependencies, entityRouter: composition.entityRouter)
        default:
            // Unreachable: `RootFeature.renderable` is what the shell filters
            // against, so a feature with no screen is never offered. Drawn as
            // the nothing-available state rather than as an empty view, because
            // a blank screen is the one outcome with no way back.
            unavailableExplanation
        }
    }

    /// What the BFM said is not usable, in its own words rather than one
    /// sentence covering both. "Not answering" and "answered something this
    /// build cannot read" call for different next actions, and the second one
    /// is about the app rather than the server.
    ///
    /// The retry is not decoration. Nothing on this screen makes a request, so
    /// a pillar coming back is not something the app finds out about by
    /// waiting — without a way to ask again, recovering means force-quitting.
    private var unavailableExplanation: some View {
        ErrorStateView(
            message: RootCopy.nothingAvailable(surface.unavailable),
            retryTitle: RootCopy.retry
        ) {
            Task { await shell.reloadBootstrap() }
        }
        .frame(maxHeight: .infinity)
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
    @ViewBuilder private var degradedBanner: some View {
        if surface.bootstrap.isDegraded {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text(RootCopy.degraded)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                    if case .failed = surface.bootstrap {
                        PopsButton(RootCopy.retry) { Task { await shell.reloadBootstrap() } }
                    }
                }
            }
            .padding([.horizontal, .top], PopsSpacing.lg)
        }
    }

    /// Built from the session rather than held, because the client behind it is
    /// per device — see ``AppComposition``.
    private var dependencies: AppDependencies {
        guard case .paired(let device) = shell.session.state else {
            return composition.pairingDependencies
        }
        return composition.dependencies(for: device)
    }
}
