include "domain.thrift"
include "msgpack.thrift"

namespace js shared
namespace java conformance.alpha

typedef i64 Identifier
enum State { READY = 7, DONE = 9 }
struct Empty {}
struct Payload {
    1: required bool flag
    2: required byte small
    3: required i16 medium
    4: required i32 integer
    5: required Identifier large
    6: required double fraction
    7: required string text
    8: required binary bytes
    9: required State state
    10: required list<Identifier> identifiers
    11: required set<domain.CurrencyRef> currencies
    12: required map<msgpack.Value, msgpack.Value> values
    13: required domain.SystemAccountSet accounts
    14: optional Empty present
    15: optional Empty absent
    16: required i8 alias_byte
}
exception Failure { 1: required i32 code, 2: required string reason }
service Echo {
    Payload echo(1: Payload value) throws (1: Failure failure)
    void notify(1: string text)
    oneway void fire(1: string text)
}
service alpha { string echo(1: string value) }
