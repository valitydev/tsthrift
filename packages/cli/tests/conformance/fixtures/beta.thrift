namespace js shared
namespace java conformance.beta

struct Payload { 1: required i32 value }
service Echo { Payload echo(1: Payload value) }
