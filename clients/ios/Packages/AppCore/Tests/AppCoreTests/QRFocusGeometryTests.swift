import Foundation
import Testing

@testable import AppCore

@Suite("QR focus geometry")
struct QRFocusGeometryTests {
    @Test("A code fills the chosen fraction of the frame at the computed distance")
    func subjectDistanceMatchesTheFieldOfView() throws {
        // 90° horizontal: the visible width equals twice the distance, so a
        // 20 mm code filling a quarter of the frame (80 mm visible) sits
        // 40 mm away.
        let distance = try #require(QRFocusGeometry.subjectDistance(fieldOfViewDegrees: 90))
        #expect(abs(distance - 40) < 0.0001)
    }

    @Test("A lens that cannot focus at the framing distance is zoomed until it can")
    func zoomsAShortSightedLens() throws {
        // ~70° field of view and a 100 mm minimum focus — a single wide lens.
        let distance = try #require(QRFocusGeometry.subjectDistance(fieldOfViewDegrees: 70))
        let zoom = QRFocusGeometry.zoomFactor(
            minimumFocusDistanceMillimetres: 100,
            fieldOfViewDegrees: 70,
            maximum: 10
        )
        #expect(zoom > 1)
        // At that zoom, the code fills the frame exactly at the focus limit.
        #expect(abs(distance * zoom - 100) < 0.0001)
    }

    @Test("A Pro main camera's long focus limit is capped rather than chased")
    func capsAProMainCamera() {
        let zoom = QRFocusGeometry.zoomFactor(
            minimumFocusDistanceMillimetres: 200,
            fieldOfViewDegrees: 70,
            maximum: 10
        )
        #expect(zoom == QRFocusGeometry.maximumAutomaticZoom)
    }

    @Test("A lens that can already focus there is left at 1×")
    func leavesAShortFocusLensAlone() {
        let zoom = QRFocusGeometry.zoomFactor(
            minimumFocusDistanceMillimetres: 10,
            fieldOfViewDegrees: 70,
            maximum: 10
        )
        #expect(zoom == 1)
    }

    @Test("An unreported minimum focus distance means no zoom")
    func unreportedFocusDistance() {
        let zoom = QRFocusGeometry.zoomFactor(
            minimumFocusDistanceMillimetres: -1,
            fieldOfViewDegrees: 70,
            maximum: 10
        )
        #expect(zoom == 1)
    }

    @Test("The zoom never exceeds the device's own ceiling")
    func clampsToTheDeviceMaximum() {
        let zoom = QRFocusGeometry.zoomFactor(
            minimumFocusDistanceMillimetres: 10_000,
            fieldOfViewDegrees: 70,
            maximum: 1.5
        )
        #expect(zoom == 1.5)
    }

    @Test("A degenerate field of view is refused rather than divided by")
    func refusesDegenerateInputs() {
        #expect(QRFocusGeometry.subjectDistance(fieldOfViewDegrees: 0) == nil)
        #expect(QRFocusGeometry.subjectDistance(fieldOfViewDegrees: 180) == nil)
        #expect(QRFocusGeometry.subjectDistance(fieldOfViewDegrees: 70, fillFraction: 0) == nil)
        let zoom = QRFocusGeometry.zoomFactor(
            minimumFocusDistanceMillimetres: 200,
            fieldOfViewDegrees: 0,
            maximum: 10
        )
        #expect(zoom == 1)
    }
}
