include "shared/common.thrift"

namespace js example

typedef common.Identifier Identifier
typedef map<string, list<Identifier>> Groups

enum Status {
  NEW,
  ACTIVE = 4,
  CLOSED
}

const i64 DEFAULT_ID = 42
const set<string> LABELS = ["first", "second"]
const map<string, i32> COUNTS = {"first": 1}

struct Empty {}

struct Request {
  1: required Identifier id
  2: optional Empty filter
  3: optional Groups groups
  4: optional set<i64> ids
  5: optional map<i64, string> labels
  6: optional binary payload
  7: optional byte flags
}

union Choice {
  1: i64 id
  2: string name
}

exception Failure {
  1: required string message
}

service Example extends common.Base {
  Request echo(1: Request request) throws (1: Failure failure)
  i64 next(1: i64 id)
}
