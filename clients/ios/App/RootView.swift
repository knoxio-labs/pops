import AppCore
import DesignSystem
import FeaturePairing
import SwiftUI

/// The app's only root. It switches on one value and draws; every decision
/// behind that value is ``AppShellModel``'s.
///
/// ## The two tasks, and why they are separate
///
/// `restoreSession` reads what the device left behind and must finish before
/// anything is drawn — that is what stops an already-paired launch from
/// flashing the pairing screen. `loadBootstrap` asks the BFM what to show and
/// must *not* gate anything: it is keyed on the paired device, so it runs when
/// a launch restores one and again when pairing produces a different one, and
/// does nothing at all while unpaired.
internal struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    internal let composition: AppComposition

    /// The pillar named by the last `pops` URL this build could not route
    /// anywhere. Drives ``unsupportedPillarAlertPresented`` rather than a
    /// plain `Bool`, so the alert's title still has the pillar's name once
    /// SwiftUI reads it to render.
    @State private var unsupportedPillar: String?

    internal var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .task { await composition.shell.restoreSession() }
            .task(id: pairedDevice) { await composition.shell.loadBootstrap() }
            // Coming back to the app is the one moment worth asking again: a
            // pillar that was down at launch may not be now, and nothing on
            // the screen the app is stuck on would ever find that out.
            // `onChange` does not fire for the initial value, so this cannot
            // double the launch request.
            // Inventory refreshes and drains its queued changes at the same
            // moment, for the same reason.
            // Leaving the foreground schedules the next background refresh.
            .onChange(of: scenePhase) { _, phase in
                switch phase {
                case .active:
                    composition.noteForeground()
                    Task { await composition.shell.reloadBootstrap() }
                    Task { await composition.refreshInventory() }
                case .background:
                    composition.scheduleBackgroundRefresh()
                default:
                    break
                }
            }
            .onOpenURL { url in
                let outcome = handleOpenPopsURL(url, router: composition.entityRouter)
                guard case .unsupported(let pillar)? = outcome else { return }
                unsupportedPillar = pillar
            }
            .alert(
                RootCopy.opensIn(unsupportedPillar ?? ""),
                isPresented: unsupportedPillarAlertPresented
            ) {}
    }

    /// `true` while ``unsupportedPillar`` holds a pillar name; setting it to
    /// `false` (the alert's own dismissal) clears that state rather than
    /// leaving a stale pillar name behind for the next link.
    private var unsupportedPillarAlertPresented: Binding<Bool> {
        Binding(
            get: { unsupportedPillar != nil },
            set: { isPresented in
                guard !isPresented else { return }
                unsupportedPillar = nil
            }
        )
    }

    /// What `loadBootstrap` is keyed on. `nil` while unpaired, which is a value
    /// the task sees once and does nothing with.
    private var pairedDevice: PairedDevice? {
        guard case .paired(let device) = composition.shell.session.state else { return nil }
        return device
    }

    @ViewBuilder private var content: some View {
        switch composition.shell.destination {
        case .launching:
            LaunchView()
        case .pairing(let reason):
            PairingView(
                model: PairingViewModel(
                    session: composition.session,
                    dependencies: composition.pairingDependencies,
                    initialBaseURL: composition.suggestedBaseURL
                ),
                returningBecause: reason
            )
        case .content(let surface):
            ContentView(surface: surface, shell: composition.shell, composition: composition)
        }
    }
}

/// What a launch shows while the device's own storage is being read.
///
/// Deliberately not a spinner and deliberately not the pairing screen. This is
/// on screen for the time a `UserDefaults` read takes, and anything that
/// animates or explains itself in that window is a flash of chrome rather than
/// a state anybody needs to understand.
internal struct LaunchView: View {
    internal var body: some View {
        Color.popsBackground
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }
}
