import AppCore
import DesignSystem
import SwiftUI

/// One picked file, open.
///
/// Paged across everything staged rather than scoped to the receipt the page
/// belongs to, because a person checking whether a photograph came out is
/// checking all of them, and having to close and reopen between groups makes
/// that four gestures instead of one.
///
/// Three ways out, which is one more than a screen usually needs: the close
/// button, a swipe down, and a tap on the ground around the page. A viewer
/// that is opened by a tap should close by a tap.
internal struct PurchasePageViewer: View {
    internal let pages: [StagedPage]
    internal let showing: StagedPage
    internal let onDelete: (StagedPage) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var current: String
    @State private var drag: CGFloat = 0

    internal init(
        pages: [StagedPage], showing: StagedPage, onDelete: @escaping (StagedPage) -> Void
    ) {
        self.pages = pages
        self.showing = showing
        self.onDelete = onDelete
        _current = State(initialValue: showing.id)
    }

    private let dismissThreshold: CGFloat = 120

    private var page: StagedPage? {
        pages.first { $0.id == current }
    }

    private var position: (index: Int, total: Int)? {
        guard let index = pages.firstIndex(where: { $0.id == current }) else { return nil }
        return (index: index, total: pages.count)
    }

    internal var body: some View {
        ZStack {
            Color.popsBackground
                .ignoresSafeArea()
                .onTapGesture { dismiss() }
            pager
                .offset(y: drag)
                .gesture(dismissDrag)
        }
        .safeAreaInset(edge: .top) { bar }
        .safeAreaInset(edge: .bottom) { actions }
    }

    private var pager: some View {
        TabView(selection: $current) {
            ForEach(pages) { page in
                PopsPhoto(data: page.bytes, placeholderSymbol: "doc.richtext")
                    .padding(PopsSpacing.xl)
                    .tag(page.id)
            }
        }
        .playgroundPagedTabs()
    }

    /// Downward only, and released below the threshold it springs back. An
    /// upward drag does nothing rather than dismissing, so a mis-swipe while
    /// looking at a tall receipt does not close the thing being looked at.
    private var dismissDrag: some Gesture {
        DragGesture()
            .onChanged { value in drag = max(value.translation.height, 0) }
            .onEnded { value in
                if value.translation.height > dismissThreshold {
                    dismiss()
                } else {
                    drag = 0
                }
            }
    }

    private var bar: some View {
        HStack(spacing: PopsSpacing.md) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .padding(PopsSpacing.md)
            }
            .playgroundGlass(in: Circle())
            .accessibilityLabel("Close")
            Spacer(minLength: PopsSpacing.sm)
            if let position {
                Text("\(position.index + 1) of \(position.total)")
                    .font(.popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            stepper
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
    }

    /// Arrows as well as the swipe. The swipe is how it will be used; the
    /// arrows are how it is used one-handed with a receipt in the other hand,
    /// which is the actual posture this screen is met in.
    private var stepper: some View {
        HStack(spacing: PopsSpacing.sm) {
            Button {
                step(-1)
            } label: {
                chevron("chevron.left")
            }
            .disabled(position?.index == 0)
            .accessibilityLabel("Previous")
            Button {
                step(1)
            } label: {
                chevron("chevron.right")
            }
            .disabled(position.map { $0.index == $0.total - 1 } ?? true)
            .accessibilityLabel("Next")
        }
    }

    private func chevron(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.popsHeadline)
            .padding(PopsSpacing.md)
            .playgroundGlass(in: Circle())
    }

    private func step(_ delta: Int) {
        guard let position else { return }
        let next = position.index + delta
        guard pages.indices.contains(next) else { return }
        current = pages[next].id
    }

    private var actions: some View {
        PopsActionBar {
            PopsButton("Recapture") {}
            if let page {
                PopsButton("Delete") { onDelete(page) }
            }
        }
    }
}
