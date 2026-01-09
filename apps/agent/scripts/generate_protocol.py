"""Generate protocol types from JSON schemas."""

import subprocess
from pathlib import Path


def main():
    """Generate Python types from JSON schemas."""
    root = Path(__file__).parent.parent
    schemas_dir = root.parent.parent / "packages" / "types" / "schemas" / "agent-protocol"
    output_dir = root / "src" / "protocol"

    output_dir.mkdir(exist_ok=True)

    schemas = [
        ("server-to-agent.json", "server_to_agent.py"),
        ("agent-to-server.json", "agent_to_server.py"),
    ]

    for schema_file, output_file in schemas:
        schema_path = schemas_dir / schema_file
        output_path = output_dir / output_file

        print(f"Generating {output_file} from {schema_file}...")

        subprocess.run(
            [
                "datamodel-codegen",
                "--input", str(schema_path),
                "--output", str(output_path),
                "--output-model-type", "typing.TypedDict",
            ],
            check=True,
        )

    print("Done!")


if __name__ == "__main__":
    main()
