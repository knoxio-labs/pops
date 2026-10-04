import AppCore
import DesignSystem
import SwiftUI

/// Searchable list of past Ego conversations.
public struct EgoConversationListView: View {
    @Bindable private var model: EgoConversationListModel
    private let onSelect: (EgoConversation) -> Void

    /// Creates a conversation list and its selection action.
    public init(
        model: EgoConversationListModel,
        onSelect: @escaping (EgoConversation) -> Void
    ) {
        self.model = model
        self.onSelect = onSelect
    }

    public var body: some View {
        List {
            switch model.state {
            case .loading:
                LoadingStateView(message: "Loading conversations.")
            case .loaded(let conversations) where conversations.isEmpty:
                EmptyStateView(message: "No conversations match “\(model.query)”.")
            case .loaded(let conversations):
                ForEach(conversations) { conversation in
                    Button {
                        onSelect(conversation)
                    } label: {
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(EgoConversationListPresentation.title(for: conversation))
                                .font(.popsBody)
                                .foregroundStyle(Color.popsForeground)
                            Text(
                                EgoConversationListPresentation.subtitle(
                                    for: conversation, now: .now)
                            )
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier(EgoConversationListAccessibility.row(conversation.id))
                }
            case .empty:
                EmptyStateView(message: "No conversations yet.")
            case .failed(let error):
                ErrorStateView(
                    message: EgoConversationListPresentation.failureMessage(for: error),
                    retryAccessibilityIdentifier: EgoConversationListAccessibility.retry
                ) {
                    Task { await model.load() }
                }
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier(EgoConversationListAccessibility.list)
        .navigationTitle("Conversations")
        .searchable(text: $model.query, prompt: "Search conversations")
        .accessibilityIdentifier(EgoConversationListAccessibility.searchField)
        .onChange(of: model.query) { _, query in
            Task { await model.search(query) }
        }
        .refreshable { await model.refresh() }
        .task { await model.load() }
    }
}

private enum EgoConversationListAccessibility {
    static let list = "ego.conversation-list"
    static let searchField = "ego.conversation-list.search"
    static let retry = "ego.conversation-list.retry"

    static func row(_ id: String) -> String {
        "ego.conversation-list.row.\(id)"
    }
}
