import conformance.alpha.Failure;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.apache.thrift.TProcessor;
import org.apache.thrift.protocol.TBinaryProtocol;
import org.apache.thrift.protocol.TProtocol;
import org.apache.thrift.transport.TMemoryBuffer;
import org.apache.thrift.transport.TMemoryInputTransport;

/** Official generated clients write requests and generated processors read them and write replies. */
public final class Conformance {
  @FunctionalInterface
  interface Response {
    Object get() throws Exception;
  }

  private static Class<?> loadService(String name) {
    try {
      return Class.forName(name + "Srv");
    } catch (ClassNotFoundException e) {
      try {
        return Class.forName(name);
      } catch (ClassNotFoundException ex) {
        throw new RuntimeException("Cannot load service class for " + name, ex);
      }
    }
  }

  private static TProcessor createProcessor(String serviceName, String method, Object[] expected, Response response) {
    try {
      Class<?> serviceClass = loadService(serviceName);
      Class<?> ifaceClass = Class.forName(serviceClass.getName() + "$Iface");
      Class<?> processorClass = Class.forName(serviceClass.getName() + "$Processor");
      Object handler = Proxy.newProxyInstance(ifaceClass.getClassLoader(), new Class<?>[] {ifaceClass},
          (proxy, called, args) -> {
            if (!called.getName().equals(method) || !Arrays.deepEquals(args, expected)) {
              throw new AssertionError("Thrift decoded unexpected method or arguments: " + called.getName());
            }
            return response.get();
          });
      return (TProcessor) processorClass.getConstructor(ifaceClass).newInstance(handler);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private static void sendRequest(String serviceName, String method, TBinaryProtocol protocol, Object... args) {
    try {
      Class<?> serviceClass = loadService(serviceName);
      Class<?> clientClass = Class.forName(serviceClass.getName() + "$Client");
      Object client = clientClass.getConstructor(TProtocol.class).newInstance(protocol);
      Method target = null;
      for (Method m : clientClass.getDeclaredMethods()) {
        if (m.getName().equals("send_" + method)) {
          target = m;
          break;
        }
      }
      if (target == null) throw new NoSuchMethodException("send_" + method + " on " + clientClass.getName());
      target.setAccessible(true);
      target.invoke(client, args);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private static TProcessor processor(String scenario) {
    boolean number = scenario.endsWith("number");
    boolean empty = scenario.startsWith("empty");
    if (scenario.startsWith("damsel-large")) {
      return createProcessor("dev.vality.damsel.domain_config_v2.Repository", "Commit",
          new Object[] {1000L, Values.largeOperations(), "local-conformance-author"}, Values::largeCommitResponse);
    }
    if (scenario.startsWith("damsel")) {
      return createProcessor("dev.vality.damsel.domain_config_v2.Repository", "Commit",
          new Object[] {42L, Values.operations(), "local-conformance-author"}, Values::commitResponse);
    }
    if (scenario.equals("beta")) {
      var value = new conformance.beta.Payload(73);
      return createProcessor("conformance.beta.Echo", "echo", new Object[] {value}, () -> value);
    }
    if (scenario.equals("alpha")) {
      return createProcessor("conformance.alpha.alpha", "echo", new Object[] {"same-name"}, () -> "same-name");
    }
    if (scenario.equals("notify") || scenario.equals("fire")) {
      return createProcessor("conformance.alpha.Echo", scenario, new Object[] {""}, () -> null);
    }
    var value = Values.payload(number, empty);
    return createProcessor("conformance.alpha.Echo", "echo", new Object[] {value}, () -> {
      if (scenario.startsWith("failure")) throw new Failure(409, "declared failure");
      return value;
    });
  }

  private static byte[] request(String scenario) throws Exception {
    var output = new TMemoryBuffer(1024);
    var protocol = new TBinaryProtocol(output, true, true);
    if (scenario.startsWith("damsel-large")) {
      sendRequest("dev.vality.damsel.domain_config_v2.Repository", "Commit", protocol, 1000L, Values.largeOperations(), "local-conformance-author");
    } else if (scenario.startsWith("damsel")) {
      sendRequest("dev.vality.damsel.domain_config_v2.Repository", "Commit", protocol, 42L, Values.operations(), "local-conformance-author");
    } else if (scenario.equals("beta")) {
      sendRequest("conformance.beta.Echo", "echo", protocol, new conformance.beta.Payload(73));
    } else if (scenario.equals("alpha")) {
      sendRequest("conformance.alpha.alpha", "echo", protocol, "same-name");
    } else if (scenario.equals("notify")) {
      sendRequest("conformance.alpha.Echo", "notify", protocol, "");
    } else if (scenario.equals("fire")) {
      sendRequest("conformance.alpha.Echo", "fire", protocol, "");
    } else {
      sendRequest("conformance.alpha.Echo", "echo", protocol, Values.payload(scenario.endsWith("number"), scenario.startsWith("empty")));
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
