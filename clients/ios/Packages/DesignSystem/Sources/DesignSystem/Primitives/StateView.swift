import Foundation
import SwiftUI

/// The shared body of the three state screens: a centred message over the app
/// background, with room for one action. Keeping it here is what stops
/// `LoadingStateView`, `EmptyStateView` and `ErrorStateView` drifting apart.
struct StateView<Accessory: View>: View {
    let message: String
    let messageColor: Color
    @ViewBuilder let accessory: () -> Accessory

    var body: some View {
        VStack(spacing: PopsSpacing.md) {
            Text(message)
                .font(.popsBody)
                .foregroundStyle(messageColor)
                .multilineTextAlignment(.center)
            accessory()
        }
        .padding(PopsSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
    }
}

/// A caller-supplied message is untrusted copy: a server error field can arrive
/// empty or as whitespace, and a state screen showing nothing is
/// indistinguishable from a broken one.
enum StateMessage {
    static func resolve(_ message: String, fallback: String) -> String {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}
