import AppCore
import SwiftUI

/// The one kind-specific fact card a dashboard shows, if the kind has one and
/// the data supports it — mirroring
/// `pillars/design/src/kit/ios-account-facts.tsx`'s dispatch exactly. A kind
/// with no fact module renders nothing, not an empty card.
internal struct AccountFactsView: View {
    internal let detail: AccountDetail

    internal var body: some View {
        switch detail.account.kind {
        case .checking, .savings:
            CheckingFactsView(account: detail.account, history: detail.history)
        case .creditCard:
            CardFactsView(account: detail.account, card: detail.card)
        case .giftCard:
            GiftCardFactsView(
                account: detail.account, originalValueMinorUnits: detail.originalValueMinorUnits)
        case .person:
            PersonFactsView(account: detail.account, history: detail.history)
        case .other:
            PointsFactsView(account: detail.account, points: detail.points)
        default:
            EmptyView()
        }
    }
}
