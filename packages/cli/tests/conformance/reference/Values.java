import conformance.alpha.Payload;
import conformance.alpha.State;
import dev.vality.damsel.domain.CurrencyRef;
import dev.vality.damsel.domain.DomainObject;
import dev.vality.damsel.domain.SystemAccount;
import dev.vality.damsel.domain.SystemAccountSet;
import dev.vality.damsel.domain.SystemAccountSetObject;
import dev.vality.damsel.domain.SystemAccountSetRef;
import dev.vality.damsel.domain_config_v2.CommitResponse;
import dev.vality.damsel.domain_config_v2.Operation;
import dev.vality.damsel.domain_config_v2.UpdateOp;
import dev.vality.damsel.msgpack.Nil;
import dev.vality.damsel.msgpack.Value;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;

/** Independent test values built with unmodified Apache-generated Java models. */
final class Values {
  static SystemAccountSet accounts(boolean empty) {
    var accounts = new LinkedHashMap<CurrencyRef, SystemAccount>();
    if (!empty) {
      accounts.put(new CurrencyRef("EUR"), new SystemAccount(101).setSubagent(0));
      accounts.put(new CurrencyRef("USD"), new SystemAccount(202));
    }
    return new SystemAccountSet("System accounts", "", accounts);
  }

  static Payload payload(boolean number, boolean empty) {
    long minimum = number ? -9007199254740991L : Long.MIN_VALUE;
    long maximum = number ? 9007199254740991L : Long.MAX_VALUE;
    byte[] bytes = new byte[empty ? 0 : 256];
    for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) i;
    var currencies = new LinkedHashSet<CurrencyRef>();
    var values = new LinkedHashMap<Value, Value>();
    var identifiers = new ArrayList<Long>();
    if (!empty) {
      currencies.add(new CurrencyRef("EUR"));
      currencies.add(new CurrencyRef("USD"));
      identifiers.addAll(List.of(0L, minimum, maximum));
      values.put(Value.str("first"), Value.arr(List.of(Value.nl(new Nil()), Value.b(false), Value.i(maximum))));
      var nested = new LinkedHashMap<Value, Value>();
      nested.put(Value.str("binary"), Value.bin(ByteBuffer.wrap(new byte[] {0, (byte) 255})));
      nested.put(Value.str("double"), Value.flt(0.5));
      values.put(Value.str("second"), Value.obj(nested));
    }
    return new Payload()
        .setFlag(false).setSmall((byte) (empty ? 0 : -128))
        .setMedium((short) (empty ? 0 : 32767)).setInteger(empty ? 0 : Integer.MIN_VALUE)
        .setLarge(empty ? 0 : minimum).setFraction(empty ? 0 : -123.25)
        .setText(empty ? "" : "Hello, Привет 🚀\u0000").setBytes(bytes).setState(State.READY)
        .setIdentifiers(identifiers).setCurrencies(currencies).setValues(values)
        .setAccounts(accounts(empty)).setPresent(new conformance.alpha.Empty())
        .setAlias_byte((byte) 0);
  }

  static DomainObject object() {
    return DomainObject.system_account_set(
        new SystemAccountSetObject(new SystemAccountSetRef(17), accounts(false)));
  }

  static List<Operation> operations() {
    return List.of(Operation.update(new UpdateOp(object())));
  }

  static CommitResponse commitResponse() {
    return new CommitResponse(42, new LinkedHashSet<>(List.of(object())));
  }
}
