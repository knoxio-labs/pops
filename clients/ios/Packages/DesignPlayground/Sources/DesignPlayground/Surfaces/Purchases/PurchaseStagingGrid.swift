import AppCore
import DesignSystem
import SwiftUI

/// What was picked, as the files themselves.
///
/// A list was the wrong shape here and the reason is worth keeping: at this
/// point nothing has been read. There is no merchant, no date and no total —
/// the only thing that identifies a receipt is the picture of it, and a row
/// spending its full width on `IMG_4821.HEIC` is a row showing the least
/// useful fact about the file at the largest size on screen.
///
/// So: a grid, and grouping by direct manipulation rather than by a selection
/// mode and a button.
///
/// - Drag one page onto another and the two become one receipt.
/// - Drag a page onto a receipt card and it joins it.
/// - Drag a page out of a card, onto the loose area, and it leaves.
///
/// Which means there is no Combine button, no Ungroup button and no selection
/// state to be in or out of — the same gesture reads forwards and backwards,
/// which is the property that makes iOS home-screen folders learnable without
/// anybody explaining them.
///
/// The loose area stays on screen even when it is empty, because it is the
/// drop target that ungroups, and a target you cannot see is a gesture with no
/// way back.
internal struct PurchaseStagingGrid: View {
    @State private var staged: StagedReceipts
    @State private var viewing: StagedPage?
    /// Which drop target the drag is currently over, if any. One value rather
    /// than a flag per tile: a drag is over exactly one thing at a time, and
    /// two tiles both believing they are the target is a state that can only
    /// be wrong.
    @State private var targeted: DropTarget?

    internal init(receipts: [StagedReceipt]) {
        _staged = State(initialValue: StagedReceipts(receipts))
    }

    /// What a drag can be let go of. `loose` is the area that ungroups, which
    /// is a target in its own right rather than the absence of one.
    private enum DropTarget: Hashable {
        case page(String)
        case receipt(String)
        case loose
    }

    private let columns = [
        GridItem(.flexible(), spacing: PopsSpacing.md),
        GridItem(.flexible(), spacing: PopsSpacing.md),
        GridItem(.flexible(), spacing: PopsSpacing.md),
    ]
    private let tileWidth: CGFloat = 96
    private let groupTile: CGFloat = 64
    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth
    /// The target settles *into* the well rather than swelling out of it.
    private let targetScale: CGFloat = 0.88
    private let liftScale: CGFloat = 1.08

    /// What rides under the finger. Opaque, because the system composites a
    /// translucent preview over its own platter and the paper came out looking
    /// like a grey slab; and scaled up a little, because the home screen lifts
    /// what you are holding rather than dimming it.
    private func lifted(_ page: StagedPage, width: CGFloat) -> some View {
        PopsPhoto(data: page.bytes, placeholderSymbol: glyph(for: page.media))
            .frame(width: width * liftScale, height: width * ratio * liftScale)
            .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
    }

    private var groups: [StagedReceipt] { staged.groups }
    private var loose: [StagedPage] { staged.loose }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                ForEach(groups) { group in
                    groupCard(group)
                }
                looseArea
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) { actions }
        .playgroundStage(item: $viewing) { page in
            PurchasePageViewer(
                staged: staged,
                showing: page,
                onDelete: {
                    staged.delete($0.id)
                    viewing = nil
                }
            )
        }
    }

    /// A receipt is a card with its pages in it, rather than a folder glyph
    /// that hides them. Hiding them would make the pages undraggable, and
    /// dragging a page out is the only way to ungroup.
    private func groupCard(_ group: StagedReceipt) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text("1 receipt · \(group.pages.count) pages")
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: PopsSpacing.md) {
                    ForEach(Array(group.pages.enumerated()), id: \.element.id) { index, page in
                        tile(page, width: groupTile, caption: "Page \(index + 1)")
                    }
                }
                .padding(.vertical, PopsSpacing.xs)
            }
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .strokeBorder(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .scaleEffect(targeted == .receipt(group.id) ? targetScale : 1)
        .background { well(active: targeted == .receipt(group.id)) }
        .animation(.snappy(duration: 0.18), value: targeted)
        .onDrop(
            of: [.plainText],
            delegate: delegate(for: .receipt(group.id)) { ids in
                staged.move(ids, into: group.id)
            })
    }

    /// The soft container the home screen grows behind the icon you are
    /// hovering over — larger than the thing itself, its own corner radius,
    /// no border. A ring reads as a selection; a well reads as somewhere the
    /// item is about to go into, which is what is about to happen.
    ///
    /// The target shrinks as the well grows, rather than swelling. Two things
    /// getting bigger at once is a fight; one settling into the other is the
    /// gesture.
    private func well(active: Bool) -> some View {
        RoundedRectangle(cornerRadius: PopsRadius.card)
            .fill(Color.popsAccent.opacity(active ? 0.3 : 0))
            .padding(-PopsSpacing.sm)
    }

    private func delegate(
        for target: DropTarget, perform: @escaping ([String]) -> Void
    ) -> PageDropDelegate {
        PageDropDelegate(
            onEntered: { note(true, as: target) },
            onExited: { note(false, as: target) },
            onDropped: { ids in
                perform(ids)
                targeted = nil
            }
        )
    }

    /// Only ever clears the target it was told about, so a `false` arriving
    /// late from the tile a drag has already left cannot blank the highlight
    /// on the one it has moved onto.
    private func note(_ over: Bool, as target: DropTarget) {
        if over {
            targeted = target
        } else if targeted == target {
            targeted = nil
        }
    }

    @ViewBuilder private var looseArea: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(looseTitle)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            if loose.isEmpty {
                emptyLoose
            } else {
                LazyVGrid(columns: columns, spacing: PopsSpacing.lg) {
                    ForEach(loose) { page in
                        tile(page, width: tileWidth, caption: page.label)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: looseMinHeight, alignment: .topLeading)
        .padding(PopsSpacing.sm)
        // Without a shape the drop region is whatever the tiles happen to
        // cover, so the empty half of a part-filled row rejects the drag —
        // which is exactly where a page being taken out of a receipt is aimed.
        .contentShape(.rect)
        .background(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .fill(Color.popsAccent.opacity(targeted == .loose ? 0.16 : 0))
        )
        .animation(.snappy(duration: 0.18), value: targeted)
        .onDrop(
            of: [.plainText],
            delegate: delegate(for: .loose) { ids in
                staged.separate(ids)
            })
    }

    private let looseMinHeight: CGFloat = 140

    private var looseTitle: String {
        switch loose.count {
        case 0: "On their own"
        case 1: "1 on its own"
        default: "\(loose.count) on their own"
        }
    }

    /// Visible at zero, because this is the target that ungroups and a gesture
    /// whose destination disappears is a gesture with no way back.
    private var emptyLoose: some View {
        Text("Drag a page here to take it out of its receipt.")
            .font(.popsCaption)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.xl)
            .background(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .strokeBorder(
                        Color.popsSeparator,
                        style: StrokeStyle(lineWidth: PopsBorder.hairline, dash: [PopsSpacing.sm])
                    )
            )
    }

    private func tile(_ page: StagedPage, width: CGFloat, caption: String) -> some View {
        let isTarget = targeted == .page(page.id)
        return VStack(spacing: PopsSpacing.xs) {
            PopsPhoto(data: page.bytes, placeholderSymbol: glyph(for: page.media))
                .frame(width: width, height: width * ratio)
                .scaleEffect(isTarget ? targetScale : 1)
                .background { well(active: isTarget) }
                .animation(.snappy(duration: 0.18), value: targeted)
            Text(caption)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(width: width)
        }
        .contentShape(.rect)
        .onTapGesture { viewing = page }
        .draggable(page.id) { lifted(page, width: width) }
        .onDrop(
            of: [.plainText],
            delegate: delegate(for: .page(page.id)) { ids in
                staged.combine(ids, with: page.id)
            }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption)
        .accessibilityAddTraits(.isButton)
    }

    private func glyph(for media: ReceiptMediaType) -> String {
        switch media {
        case .jpeg, .png, .webp, .gif: "doc.text.image"
        case .pdf: "doc.richtext"
        case .plainText: "doc.plaintext"
        }
    }

    private var actions: some View {
        PopsActionBar {
            PopsButton(readTitle, prominence: .prominent) {}
                .disabled(staged.isEmpty)
        }
    }

    private var readTitle: String {
        staged.count == 1 ? "Read this receipt" : "Read \(staged.count) receipts"
    }
}
