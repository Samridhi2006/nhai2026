import sys
import tflite

def inspect_model(path):
    print(f"--- Inspecting {path} ---")
    try:
        with open(path, "rb") as f:
            buf = f.read()
            model = tflite.Model.GetRootAsModel(buf, 0)
            
            subgraph = model.Subgraphs(0)
            
            print("Inputs:")
            for i in range(subgraph.InputsLength()):
                idx = subgraph.Inputs(i)
                tensor = subgraph.Tensors(idx)
                shape = [tensor.Shape(j) for j in range(tensor.ShapeLength())]
                print(f"  [{i}] name: {tensor.Name().decode('utf-8')}, type: {tensor.Type()}, shape: {shape}")
                
            print("Outputs:")
            for i in range(subgraph.OutputsLength()):
                idx = subgraph.Outputs(i)
                tensor = subgraph.Tensors(idx)
                shape = [tensor.Shape(j) for j in range(tensor.ShapeLength())]
                print(f"  [{i}] name: {tensor.Name().decode('utf-8')}, type: {tensor.Type()}, shape: {shape}")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    inspect_model("assets/models/blazeface.tflite")
    inspect_model("assets/models/mobilefacenet_int8.tflite")
