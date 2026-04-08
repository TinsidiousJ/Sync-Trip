if (votableOptionIds.length === 0) {
  const fallbackWinner = options.length > 0 ? options[0] : null;
  const result = await finaliseSingleOptionResult(sessionCode, session, fallbackWinner);

  return res.json({
    sessionCode,
    saved: true,
    allVotesComplete: true,
    movedToTieBreak: false,
    winner: result.winner,
    tie: false,
    itineraryItem: result.itineraryItem,
  });
}