"""GroupCart split: receipt -> agents' room -> shares -> payment.

Loaded by the runtime as a plugin. Start with flow.py for what happens, tools.py
for what the model can call, and docs/SPLIT_FLOW.md for the whole picture.
"""


def register(ctx) -> None:
    from . import cli, hooks, schemas, tools

    for schema in schemas.ALL:
        ctx.register_tool(name=schema["name"], toolset="split", schema=schema, handler=tools.HANDLERS[schema["name"]])
    ctx.register_hook("pre_llm_call", hooks.turn_context)
    ctx.register_hook("pre_gateway_dispatch", hooks.remember_receipt)
    ctx.register_command("room", handler=cli.room_command,
                         description="Show what the agents said to each other about your latest split")
    ctx.register_cli_command(name="split", help="Inspect GroupCart splits: the agents' room, people, outbox",
                             setup_fn=cli.setup, handler_fn=cli.dispatch)
