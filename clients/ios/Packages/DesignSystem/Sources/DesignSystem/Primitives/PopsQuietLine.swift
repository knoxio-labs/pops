import SwiftUI

/// One muted line, centred, where a list would be.
public struct PopsCentredLine: View {
    private let text: String

    /// Creates a centred placeholder with the supplied copy.
    public init(text: String) { self.text = text }

    public var body: some View {
        Text(text)
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, PopsSpacing.xl)
            .transition(.opacity)
    }
}

/// One muted line where a list would be.
public struct PopsEmptyLine: View {
    private let text: String

    /// Creates a leading-aligned placeholder with the supplied copy.
    public init(text: String) { self.text = text }

    public var body: some View {
        Text(text)
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, PopsSpacing.md)
            .transition(.opacity)
    }
}
