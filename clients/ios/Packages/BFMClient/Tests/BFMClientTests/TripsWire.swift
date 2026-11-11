import Foundation
import Testing

@testable import BFMClient

internal enum TripsWire {
    internal static func trip(_ id: Int) -> String {
        """
        {"id":\(id),"name":"Trip \(id)","destination":"Source destination","when":"Summer",\
        "tagId":null,"parentId":null,"notes":"Source note",\
        "sourceLinks":[{"uri":"pops:documents/document/123","label":"Confirmation"}],\
        "createdAt":"2026-01-01T00:00:00.123Z","updatedAt":"2026-01-01T00:00:00.456Z"}
        """
    }

    internal static func page(_ ids: [Int], cursor: String?, total: Int) -> String {
        let next = cursor.map { "\"\($0)\"" } ?? "null"
        return """
            {"items":[\(ids.map(trip).joined(separator: ","))],"nextCursor":\(next),"totalCount":\(total)}
            """
    }

    internal static var detail: String {
        """
        {"trip":\(trip(1)),"places":[],"visits":[],"journeyGroups":[],"stays":[],\
        "events":[],"documentAssociations":[],"journeys":[
        {"id":3,"tripId":1,"name":null,"reference":"SRC123","notes":"","sourceLinks":[],"buffers":{},\
        "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z",\
        "legs":[\(leg(22)),\(leg(11))]}]}
        """
    }

    internal static func leg(_ id: Int) -> String {
        """
        {"id":\(id),"journeyId":3,"mode":"flight",\
        "from":{"local":"2026-01-02T12:00","sourceLabel":"Recorded departure"},\
        "to":{"local":"2026-01-02T13:00","timeZone":"UTC"},\
        "intention":"Considering","arrangement":"Booked","purchase":null,"operator":null,\
        "service":null,"reference":null,"notes":"","sourceLinks":[],\
        "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}
        """
    }

    internal static func failure(_ code: String) -> String {
        """
        {"code":"\(code)","message":"Request refused","requestId":"trip-request","retryable":false}
        """
    }
}

extension BFMTripsRepository {
    internal static func stubbed(_ transport: StubTransport) throws -> BFMTripsRepository {
        BFMTripsRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")), transport: transport))
    }
}
