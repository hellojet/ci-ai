"""Prompt 拼装器：根据分镜信息拼装完整的生成 Prompt。"""


def build_shot_prompt(
    shot,
    scene,
    project_style=None,
    characters: list | None = None,
) -> dict:
    """
    根据分镜信息拼装完整的生成 Prompt。

    拼装顺序：风格 → 场景 → 角色 → 动作 → 镜头角度

    Returns:
        dict 包含 full_prompt (str) 和 components (dict)
    """
    components: dict[str, str | list[str]] = {}
    parts: list[str] = []

    # 1. 风格前缀
    if project_style and getattr(project_style, "prompt", None):
        components["style"] = project_style.prompt
        parts.append(f"Style: {project_style.prompt}")

    # 2. 场景描述
    scene_prompt = getattr(scene, "description_prompt", None) or ""
    if scene_prompt:
        components["scene"] = scene_prompt
        parts.append(f"Scene: {scene_prompt}")

    # 3. 角色描述
    if characters:
        character_prompts = []
        for character in characters:
            visual_prompt = getattr(character, "visual_prompt", None) or ""
            if visual_prompt:
                character_prompts.append(f"{character.name}: {visual_prompt}")
        if character_prompts:
            components["characters"] = character_prompts
            parts.append("Characters: " + "; ".join(character_prompts))

    # 4. 动作描述
    action = getattr(shot, "action_description", None) or ""
    if action:
        components["action"] = action
        parts.append(f"Action: {action}")

    # 5. 镜头角度
    camera = getattr(shot, "camera_angle", None) or ""
    if camera:
        components["camera_angle"] = camera
        parts.append(f"Camera: {camera}")

    # 6. 旁白 / 对话（辅助上下文）
    narration = getattr(shot, "narration", None) or ""
    dialogue = getattr(shot, "dialogue", None) or ""
    if narration:
        components["narration"] = narration
    if dialogue:
        components["dialogue"] = dialogue

    full_prompt = ". ".join(parts)

    return {
        "full_prompt": full_prompt,
        "components": components,
    }
