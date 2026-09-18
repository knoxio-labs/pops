import DesignSystem
import SwiftUI

/// What unpacking has done to a container's contents on its page: what has
/// left, and which rows are selected.
internal struct InventoryContainerUnpacking: Equatable {
    internal var removed: Set<String> = []
    internal var selection = InventorySelection()
    /// Keep or Retire was chosen, so the emptied card has done its job.
    internal var emptiedResolved = false
}

/// A staged container page: where unpacking starts, what happens a beat
/// after it opens, and where the page is scrolled to so the contents show.
internal struct InventoryContainerUnpackingStage {
    internal enum Then: Equatable {
        case moveSelected(to: String)
        case takeOutAll
        case close
    }

    internal var start = InventoryContainerUnpacking()
    internal var then: Then?
}

/// Shown in place of the contents once the last thing has left: the box's
/// photo and two equal choices. Nothing blocks on it.
internal struct InventoryContainerEmptiedCard: View {
    internal let profile: InventoryContainerProfile
    internal let onChoose: (InventoryEmptyContainerChoice) -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.md) {
                InventoryRecordMark(
                    photo: profile.detail.photos.first?.imageData,
                    symbol: profile.item.symbol.system)
                Text("\(profile.item.name) is empty")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: PopsSpacing.zero)
            }
            PlaygroundGlassGroup(spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.sm) {
                    ForEach(InventoryEmptyContainerChoice.allCases) { choice in
                        Button {
                            onChoose(choice)
                        } label: {
                            Label {
                                Text(choice.title)
                            } icon: {
                                choice.symbol.image
                            }
                            .font(.popsHeadline)
                            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                        }
                        .playgroundGlassButton()
                    }
                }
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .transition(InventoryMotion.row)
    }
}
