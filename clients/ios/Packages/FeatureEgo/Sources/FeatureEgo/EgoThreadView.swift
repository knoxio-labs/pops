import AppCore
import DesignSystem
import SwiftUI

/// The transcript and composer for one Ego conversation.
@MainActor
public struct EgoThreadView: View {
    @State private var model: EgoThreadModel
    @State private var notices: [String] = []
    @State private var isLoadingConversation = false
    @State private var transcriptPosition = ScrollPosition(edge: .bottom)

    private let entityRouter: any EntityRouter

    /// Creates a thread screen for an existing or new conversation.
    public init(model: EgoThreadModel, entityRouter: any EntityRouter) {
        _model = State(wrappedValue: model)
        self.entityRouter = entityRouter
    }

    private var rows: [EgoThreadRow] {
        EgoThreadRow.rows(messages: model.messages, turn: model.turn, notices: notices)
    }

    public var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            if let failure = model.loadFailure {
                loadFailureView(failure)
            } else if isLoadingConversation {
                LoadingStateView(message: "Loading conversation.")
            } else if rows.isEmpty {
                EgoWelcomeView { suggestion in
                    model.send(prompt: suggestion.prompt)
                }
            } else {
                transcript
            }
        }
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom, spacing: PopsSpacing.zero) {
            EgoComposerView(
                model: model,
                isSendAvailable: model.loadFailure == nil && !isLoadingConversation
            )
        }
        .task { await loadConversation() }
        .onChange(of: model.navigationTarget) { _, _ in
            routePendingNavigation()
        }
    }

    private func loadConversation() async {
        guard model.conversationId != nil else { return }
        isLoadingConversation = true
        defer { isLoadingConversation = false }
        await model.load()
    }

    @ViewBuilder
    private func loadFailureView(_ error: RepositoryError) -> some View {
        let failure = EgoThreadModelFailurePresentation.failureCopy(for: error)
        if failure.retryable {
            ErrorStateView(
                message: failure.message,
                retryTitle: "Reload conversation",
                retryAccessibilityIdentifier: "ego-thread-load-retry"
            ) {
                Task { await model.load() }
            }
        } else {
            NonRetryableErrorStateView(message: failure.message)
        }
    }

    private var transcript: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                ForEach(rows) { row in
                    rowView(row)
                        .id(row.id)
                }
            }
            .scrollTargetLayout()
            .padding(PopsSpacing.lg)
        }
        .scrollPosition($transcriptPosition)
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier("ego-thread-transcript")
        .onChange(of: rows) { _, incomingRows in
            guard !incomingRows.isEmpty else { return }
            withAnimation { transcriptPosition.scrollTo(edge: .bottom) }
        }
    }

    @ViewBuilder private func rowView(_ row: EgoThreadRow) -> some View {
        switch row {
        case .text(_, _, let role, let text):
            EgoMessageView(role: role, text: text)
        case .entity(_, _, let part):
            EgoEntityCardView(part: part, entityRouter: entityRouter) { pillar in
                notices.append("This app can’t open references from \(pillar).")
            }
        case .actions(_, _, let part):
            EgoBatchCardHost(part: part, threadModel: model)
        case .tool(let activity):
            EgoToolActivityView(activity: activity)
        case .streaming(let text):
            EgoStreamingBubbleView(text: text)
        case .failure(let message, let retryable):
            EgoTurnFailureView(message: message, retryable: retryable) { model.retry() }
        case .notice(_, let message):
            Text(message)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func routePendingNavigation() {
        guard let uriString = model.consumeNavigation() else { return }
        guard let uri = parseObjectURI(uriString) else {
            notices.append("Ego returned a link this app can’t open.")
            return
        }
        if case .unsupported(let pillar) = entityRouter.route(uri) {
            notices.append("This app can’t open references from \(pillar).")
        }
    }
}

@MainActor
private struct EgoTurnFailureView: View {
    let message: String
    let retryable: Bool
    let onRetry: () -> Void

    var body: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                HStack(alignment: .top, spacing: PopsSpacing.sm) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Color.popsDestructive)
                        .accessibilityHidden(true)
                    Text(message)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if retryable {
                    Button(action: onRetry) {
                        Label("Try again", systemImage: "arrow.clockwise")
                    }
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsAccent)
                    .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                    .accessibilityIdentifier("ego-thread-retry")
                }
            }
        }
        .accessibilityIdentifier("ego-thread-failure")
    }
}

@MainActor
private struct EgoBatchCardHost: View {
    @State private var model: EgoBatchModel

    private let part: EgoActionsPart

    init(part: EgoActionsPart, threadModel: EgoThreadModel) {
        self.part = part
        let batchId = part.batchId
        _model = State(
            wrappedValue: EgoBatchModel(
                part: part,
                decide: { batchID, decision in
                    try await threadModel.decideBatch(batchID, decision)
                },
                isEnabled: { threadModel.canDecideBatch },
                resume: { await threadModel.continueBatch($0) },
                isContinuable: { threadModel.continuableBatchId == batchId }
            )
        )
    }

    var body: some View {
        EgoBatchCardView(model: model)
            .onChange(of: part) { _, incoming in model.sync(incoming) }
    }
}
