import conformance.alpha.Echo;
import conformance.alpha.Failure;
import dev.vality.damsel.domain_config_v2.Repository;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.apache.thrift.TProcessor;
import org.apache.thrift.protocol.TBinaryProtocol;
import org.apache.thrift.transport.TMemoryBuffer;
import org.apache.thrift.transport.TMemoryInputTransport;

/** Official generated clients write requests and generated processors read them and write replies. */
public final class Conformance {
  @FunctionalInterface
  interface Response {
    Object get() throws Exception;
  }

  private static <T> T handler(Class<T> type, String method, Object[] expected, Response response) {
    return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type},
        (proxy, called, args) -> {
          if (!called.getName().equals(method) || !Arrays.deepEquals(args, expected)) {
            throw new AssertionError("Apache decoded unexpected method or arguments: " + called.getName());
          }
          return response.get();
        }));
  }

  private static TProcessor processor(String scenario) {
    boolean number = scenario.endsWith("number");
    boolean empty = scenario.startsWith("empty");
    if (scenario.startsWith("damsel")) {
      return new Repository.Processor<>(handler(Repository.Iface.class, "Commit",
          new Object[] {42L, Values.operations(), "local-conformance-author"}, Values::commitResponse));
    }
    if (scenario.equals("beta")) {
      var value = new conformance.beta.Payload(73);
      return new conformance.beta.Echo.Processor<>(handler(conformance.beta.Echo.Iface.class,
          "echo", new Object[] {value}, () -> value));
    }
    if (scenario.equals("alpha")) {
      return new conformance.alpha.alpha.Processor<>(handler(conformance.alpha.alpha.Iface.class,
          "echo", new Object[] {"same-name"}, () -> "same-name"));
    }
    if (scenario.equals("notify") || scenario.equals("fire")) {
      return new Echo.Processor<>(handler(Echo.Iface.class, scenario, new Object[] {""}, () -> null));
    }
    var value = Values.payload(number, empty);
    return new Echo.Processor<>(handler(Echo.Iface.class, "echo", new Object[] {value}, () -> {
      if (scenario.startsWith("failure")) throw new Failure(409, "declared failure");
      return value;
    }));
  }

  private static byte[] request(String scenario) throws Exception {
    var output = new TMemoryBuffer(1024);
    var protocol = new TBinaryProtocol(output, true, true);
    if (scenario.startsWith("damsel")) {
      new Repository.Client(protocol).send_Commit(42, Values.operations(), "local-conformance-author");
    } else if (scenario.equals("beta")) {
      new conformance.beta.Echo.Client(protocol).send_echo(new conformance.beta.Payload(73));
    } else if (scenario.equals("alpha")) {
      new conformance.alpha.alpha.Client(protocol).send_echo("same-name");
    } else if (scenario.equals("notify")) {
      new Echo.Client(protocol).send_notify("");
    } else if (scenario.equals("fire")) {
      new Echo.Client(protocol).send_fire("");
    } else {
      new Echo.Client(protocol).send_echo(Values.payload(scenario.endsWith("number"), scenario.startsWith("empty")));
    }
    return Arrays.copyOf(output.getArray(), output.length());
  }

  private static byte[] process(String scenario, byte[] request) throws Exception {
    var input = new TMemoryInputTransport(request);
    var output = new TMemoryBuffer(1024);
    processor(scenario).process(new TBinaryProtocol(input, true, true), new TBinaryProtocol(output, true, true));
    if (input.getBytesRemainingInBuffer() != 0) throw new AssertionError("Unread request bytes");
    return Arrays.copyOf(output.getArray(), output.length());
  }

  public static void main(String[] args) throws Exception {
    String action = args[0];
    String scenario = args[1];
    if (action.equals("reference")) {
      Path directory = Path.of(args[2]);
      byte[] request = request(scenario);
      Files.write(directory.resolve(scenario + ".request.bin"), request);
      Files.write(directory.resolve(scenario + ".reply.bin"), process(scenario, request));
    } else if (action.equals("process")) {
      Files.write(Path.of(args[3]), process(scenario, Files.readAllBytes(Path.of(args[2]))));
    } else {
      throw new IllegalArgumentException("Unknown action: " + action);
    }
  }
}
