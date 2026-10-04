import AppCore
import Observation
import SwiftUI

/// The conversation and history screens, composed as one embeddable Ego flow.
@MainActor
public struct EgoFlowView: View {
    @State private var flow: EgoFlow

    private let onClose: () -> Void

    /// Creates an Ego flow with its repository and entity navigation supplied by the app.
    public init(
        dependencies: AppDependencies,
        context: @escaping @MainActor () -> EgoAppContext?,
        entityRouter: any EntityRouter,
        onClose: @escaping () -> Void
    ) {
        _flow = State(
            wrappedValue: EgoFlow(
                dependencies: dependencies,
                context: context,
                entityRouter: entityRouter
            )
        )
        self.onClose = onClose
    }

    public var body: some View {
        NavigationStack {
            EgoThreadView(model: flow.thread, entityRouter: flow.entityRouter)
                .id(ObjectIdentifier(flow.thread))
                .navigationTitle("Ego")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(action: onClose) {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel("Close Ego")
                    }
                    ToolbarItemGroup(placement: .primaryAction) {
                        Button(action: flow.startNew) {
                            Image(systemName: "square.and.pencil")
                        }
                        .accessibilityLabel("New conversation")
                        .accessibilityIdentifier("ego-new-conversation")

                        Button {
                            flow.isShowingConversations = true
                        } label: {
                            Image(systemName: "clock")
                        }
                        .accessibilityLabel("Conversation history")
                        .accessibilityIdentifier("ego-conversation-history")
                    }
                }
                .navigationDestination(isPresented: $flow.isShowingConversations) {
                    EgoConversationListView(model: flow.conversations) { conversation in
                        flow.open(conversation)
                    }
                }
        }
    }
}

/// State shared by every screen in the Ego flow.
@MainActor
@Observable
internal final class EgoFlow {
    internal private(set) var thread: EgoThreadModel
    internal var isShowingConversations = false

    internal let conversations: EgoConversationListModel
    internal let entityRouter: any EntityRouter

    @ObservationIgnored private let dependencies: AppDependencies
    @ObservationIgnored private let context: @MainActor () -> EgoAppContext?

    internal init(
        dependencies: AppDependencies,
        context: @escaping @MainActor () -> EgoAppContext?,
        entityRouter: any EntityRouter
    ) {
        self.dependencies = dependencies
        self.context = context
        self.entityRouter = entityRouter
        thread = EgoThreadModel(repository: dependencies.ego, context: context)
        conversations = EgoConversationListModel(repository: dependencies.ego)
    }

    internal func startNew() {
        thread.cancel()
        thread = EgoThreadModel(repository: dependencies.ego, context: context)
        isShowingConversations = false
    }

    internal func open(_ conversation: EgoConversation) {
        thread.cancel()
        thread = EgoThreadModel(
            repository: dependencies.ego,
            context: context,
            conversationId: conversation.id
        )
        isShowingConversations = false
    }
}
