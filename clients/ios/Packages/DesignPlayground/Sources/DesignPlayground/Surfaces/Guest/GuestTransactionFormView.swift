import DesignSystem
import SwiftUI

internal enum GuestFormMode: Hashable, Sendable {
    case new
    case edit(GuestEntry)
}

internal enum GuestSaveState: Hashable, Sendable {
    case idle
    case saving
    case failed(GuestSaveFailure)
}

/// Everything a form state is staged from. One value rather than seven
/// arguments, so a state names only what makes it different.
internal struct GuestFormStage {
    internal var accounts: [GuestAccount]
    internal var mode: GuestFormMode = .new
    internal var draft: GuestTransactionDraft?
    internal var save: GuestSaveState = .idle
    internal var showsProblems = false
    internal var receipt = GuestReceiptState()
    internal var offline = false
}

internal enum GuestFormCopy {
    internal static let newTitle = "New entry"
    internal static let editTitle = "Edit entry"
    internal static let cancel = "Cancel"
    internal static let save = "Save"
    internal static let saving = "Saving"
    internal static let retry = "Try again"
    internal static let discardTitle = "Discard what you typed?"
    internal static let discard = "Discard"
    internal static let keepTyping = "Keep typing"
    internal static let offline = "Offline. Connect to save this entry."

    internal static func problem(_ field: GuestTransactionDraft.Field) -> String {
        switch field {
        case .account: "Choose an account."
        case .kind: "Choose a type."
        case .amount: "Enter an amount above zero."
        case .description: "Say what it was for."
        }
    }
}

/// Adding or editing one ledger entry: account, type, date, amount and
/// description, with a receipt strip under them. It saves from the bar and
/// offers no delete.
internal struct GuestTransactionFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: GuestTransactionDraft
    @State private var receipt: GuestReceiptState
    @State private var save: GuestSaveState
    @State private var showsProblems: Bool
    @State private var cancelling = false

    private let opened: GuestTransactionDraft
    private let accounts: [GuestAccount]
    private let mode: GuestFormMode
    private let offline: Bool

    internal init(stage: GuestFormStage) {
        let start = stage.draft ?? Self.opening(stage)
        opened = start
        accounts = stage.accounts
        mode = stage.mode
        offline = stage.offline
        _draft = State(initialValue: start)
        _receipt = State(initialValue: stage.receipt)
        _save = State(initialValue: stage.save)
        _showsProblems = State(initialValue: stage.showsProblems)
    }

    private static func opening(_ stage: GuestFormStage) -> GuestTransactionDraft {
        if case .edit(let entry) = stage.mode,
            let account = stage.accounts.first(where: { $0.id == entry.accountID })
        {
            return .editing(entry, in: account)
        }
        return .blank(accounts: stage.accounts, on: GuestFixtures.today)
    }

    private var problems: Set<GuestTransactionDraft.Field> {
        showsProblems ? draft.missing(accounts: accounts) : []
    }

    private var existing: [GuestAttachment] {
        if case .edit(let entry) = mode { return entry.attachments }
        return []
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                GuestFormFields(draft: $draft, accounts: accounts, problems: problems)
                GuestReceiptSection(
                    receipt: $receipt, draft: $draft, accounts: accounts, existing: existing)
            }
            .padding(PopsSpacing.lg)
            .disabled(save == .saving)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) { status }
        .navigationTitle(mode == .new ? GuestFormCopy.newTitle : GuestFormCopy.editTitle)
        .playgroundTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { cancel }
            ToolbarItem(placement: .confirmationAction) { confirm }
        }
    }

    @ViewBuilder private var status: some View {
        if case .failed(let failure) = save {
            GuestNotice(symbol: "xmark.octagon.fill", tint: .popsDestructive, text: failure.message)
            {
                if failure.isRetryable {
                    Button(GuestFormCopy.retry, systemImage: "arrow.clockwise") { attempt() }
                        .labelStyle(.iconOnly)
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            .background(.regularMaterial)
        } else if offline {
            GuestOfflineBar(text: GuestFormCopy.offline)
        }
    }

    private var cancel: some View {
        Button(GuestFormCopy.cancel, systemImage: "xmark") {
            if draft == opened && receipt.pages.isEmpty { dismiss() } else { cancelling = true }
        }
        .labelStyle(.iconOnly)
        .disabled(save == .saving)
        .confirmationDialog(
            GuestFormCopy.discardTitle, isPresented: $cancelling, titleVisibility: .visible
        ) {
            Button(GuestFormCopy.discard, role: .destructive) { dismiss() }
            Button(GuestFormCopy.keepTyping, role: .cancel) {}
        }
    }

    @ViewBuilder private var confirm: some View {
        if save == .saving {
            ProgressView().accessibilityLabel(GuestFormCopy.saving)
        } else {
            Button(GuestFormCopy.save, systemImage: "checkmark") { attempt() }
                .labelStyle(.iconOnly)
                .disabled(offline || receipt.reading == .reading)
        }
    }

    /// The playground's stand-in for a save: it shows what is missing, or
    /// holds the saving state for a beat and closes.
    private func attempt() {
        guard draft.missing(accounts: accounts).isEmpty else {
            showsProblems = true
            return
        }
        save = .saving
        Task {
            try? await Task.sleep(for: InventoryMotion.stagedBeat)
            save = .idle
            dismiss()
        }
    }
}
