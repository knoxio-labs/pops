import DesignSystem
import SwiftUI

internal struct TypePickerCaptureSection: View {
    let session: TypePickerSession
    @ScaledMetric(relativeTo: .body) private var side = PopsSize.countField

    var body: some View {
        Section {
            ScrollView(.horizontal) {
                HStack(spacing: PopsSpacing.sm) {
                    Button(action: session.capturePhoto) {
                        Image(systemName: "camera")
                            .font(.popsTitle)
                            .frame(width: side, height: side)
                            .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Take sample photo")
                    ForEach(0..<session.photoCount, id: \.self) { index in
                        VStack(spacing: PopsSpacing.xs) {
                            Image(systemName: "photo").font(.popsTitle)
                            Text("\(index + 1)").font(.popsCaption)
                        }
                        .frame(width: side, height: side)
                        .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Sample photo \(index + 1)")
                    }
                }
            }
            .scrollIndicators(.hidden)
            if session.photoCount > 0 {
                Button("Remove last photo", role: .destructive, action: session.removeLastPhoto)
                    .frame(minHeight: PopsSize.touchTarget)
            }
        } footer: {
            Text("\(session.photoCount) sample photos · camera and upload are simulated")
        }
    }
}
