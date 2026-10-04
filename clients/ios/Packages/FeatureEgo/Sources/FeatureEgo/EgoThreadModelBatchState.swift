import AppCore

internal enum EgoThreadModelBatchState {
    static func continuableBatchId(in messages: [EgoMessage]) -> String? {
        guard let lastMessage = messages.last, lastMessage.role == .assistant else { return nil }

        let batch = lastMessage.parts.reversed().compactMap { part -> EgoActionsPart? in
            guard case .actions(let actions) = part else { return nil }
            return actions
        }.first
        guard let batch,
            !batch.actions.isEmpty,
            !batch.actions.contains(where: { $0.status == EgoActionStatus.pending })
        else {
            return nil
        }

        let hasConfirmedAction = batch.actions.contains {
            $0.status == EgoActionStatus.confirmed
        }
        let allActionsRejected = batch.actions.allSatisfy {
            $0.status == EgoActionStatus.rejected
        }
        return hasConfirmedAction || allActionsRejected ? batch.batchId : nil
    }
}
