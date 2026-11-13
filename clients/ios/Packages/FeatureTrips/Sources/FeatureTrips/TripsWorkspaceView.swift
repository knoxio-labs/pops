import AppCore
import DesignSystem
import SwiftUI

internal struct TripsWorkspaceView: View {
    @Bindable internal var model: TripsModel
    internal let tab: TripsTab
    internal var capture: (() -> Void)?
    @State private var planLens = TripsPlanLens.line
    @State private var calendarSelection = TripsPlanCalendarSelection()

    internal var body: some View {
        Group {
            switch tab {
            case .trips: today
            case .plan: plan
            case .inbox:
                ScrollView {
                    TripsInboxView(model: model.inbox, capture: capture)
                        .padding(PopsSpacing.xl)
                }
            case .search: EmptyView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .onChange(of: model.selectedID) {
            planLens = .line
        }
    }

    @ViewBuilder private var today: some View {
        if model.loading {
            LoadingStateView()
        } else if let failure = model.failure {
            TripsFailureView(failure: failure) { Task { await model.load() } }
        } else if let snapshot = model.snapshot {
            TripsTimelineView(snapshot: snapshot)
        } else {
            ContentUnavailableView("Trip details unavailable", systemImage: "map")
        }
    }

    @ViewBuilder private var plan: some View {
        switch model.route.state {
        case .loaded(let route):
            ScrollView {
                TripsPlanView(
                    route: route, snapshot: model.snapshot, lens: $planLens,
                    selectedDay: calendarSelection.binding(for: model)
                ) {
                    model.source = $0
                }
                .padding(PopsSpacing.xl)
            }
        case .failed(let error):
            TripsFailureView(failure: error) { model.route.retry() }
        case .missing:
            ContentUnavailableView {
                Label(
                    "Route unavailable",
                    systemImage: "point.topleft.down.to.point.bottomright.curvepath")
            } description: {
                Text(
                    "The server did not return a route for this trip. Recorded sources remain in Today."
                )
            } actions: {
                Button("Try Again") { model.route.retry() }
            }
        case .loading:
            LoadingStateView()
        case .unbound:
            ContentUnavailableView {
                Label("Plan is not connected", systemImage: "map")
            } description: {
                Text("Plan is unavailable in this app. Recorded sources remain available in Today.")
            }
        case .idle:
            ContentUnavailableView("Route not loaded", systemImage: "map")
        }
    }
}
