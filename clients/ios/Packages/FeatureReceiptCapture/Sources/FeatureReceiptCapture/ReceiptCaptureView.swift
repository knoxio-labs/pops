import DesignSystem
import SwiftUI

/// The feature's whole public surface today: a placeholder that compiles and
/// is reachable from the shell, ahead of the capture flow itself.
public struct ReceiptCaptureView: View {
    public init() {}

    public var body: some View {
        VStack(spacing: PopsSpacing.md) {
            Text(ReceiptCaptureCopy.title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text(ReceiptCaptureCopy.placeholder)
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
                .multilineTextAlignment(.center)
        }
        .padding(PopsSpacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
    }
}

#Preview("Receipt capture — light") {
    ReceiptCaptureView()
        .preferredColorScheme(.light)
}

#Preview("Receipt capture — dark") {
    ReceiptCaptureView()
        .preferredColorScheme(.dark)
}
